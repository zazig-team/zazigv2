/**
 * zazigv2 — execute-sql Edge Function
 *
 * Executes scoped SQL statements against the pipeline database.
 * Restricted to jobs, features, agent_events, machines tables.
 * Used by the pipeline-technician contractor for prescribed operations.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Safety checks
// ---------------------------------------------------------------------------

const TABLE_ALLOWLIST = ["jobs", "features", "agent_events", "machines"];
const SYNTAX_BLOCKLIST = /\b(DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

/** Extract table names referenced via FROM, INTO, UPDATE, JOIN, DELETE FROM */
function extractTableNames(sql: string): string[] {
  const patterns = [
    /\bFROM\s+(\w+)/gi,
    /\bINTO\s+(\w+)/gi,
    /\bUPDATE\s+(\w+)/gi,
    /\bJOIN\s+(\w+)/gi,
    /\bDELETE\s+FROM\s+(\w+)/gi,
  ];
  const tables = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      tables.add(match[1].toLowerCase());
    }
  }
  return [...tables];
}

/** Check that DELETE/UPDATE statements contain a WHERE clause */
function hasUnsafeModification(sql: string): boolean {
  // Split on semicolons to check each statement individually
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    if (/^\s*(DELETE|UPDATE)\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const body = await req.json();
    const { sql, expected_affected_rows } = body as {
      sql: string;
      expected_affected_rows?: number;
    };

    if (!sql || typeof sql !== "string") {
      return jsonResponse({ error: "sql is required and must be a string" }, 400);
    }

    // --- Syntax blocklist ---
    if (SYNTAX_BLOCKLIST.test(sql)) {
      return jsonResponse(
        { error: "SQL contains blocked syntax (DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE)" },
        400,
      );
    }

    // --- Table allowlist ---
    const tables = extractTableNames(sql);
    const disallowed = tables.filter((t) => !TABLE_ALLOWLIST.includes(t));
    if (disallowed.length > 0) {
      return jsonResponse(
        { error: `SQL references disallowed tables: ${disallowed.join(", ")}. Allowed: ${TABLE_ALLOWLIST.join(", ")}` },
        400,
      );
    }

    // --- DELETE/UPDATE safety ---
    if (hasUnsafeModification(sql)) {
      return jsonResponse(
        { error: "DELETE and UPDATE statements must include a WHERE clause" },
        400,
      );
    }

    // --- Execute via RPC ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("execute_raw_sql", { query: sql });

    if (error) {
      return jsonResponse({ error: `SQL execution failed: ${error.message}` }, 500);
    }

    const rows = data?.rows ?? [];
    const affected_rows = data?.affected_rows ?? 0;

    const result: Record<string, unknown> = { rows, affected_rows };

    if (
      expected_affected_rows !== undefined &&
      expected_affected_rows !== null &&
      affected_rows !== expected_affected_rows
    ) {
      result.warning = `Expected ${expected_affected_rows} affected rows but got ${affected_rows}`;
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
