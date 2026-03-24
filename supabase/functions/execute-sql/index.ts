/**
 * zazigv2 — execute-sql Edge Function
 *
 * Executes scoped SQL statements against the pipeline database.
 * Restricted to jobs, features, agent_events, machines, capabilities, capability_lanes tables.
 * Used by pipeline-technician for operations and CPO for roadmap management.
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

const TABLE_ALLOWLIST = [
  "jobs", "features", "agent_events", "machines", "capabilities", "capability_lanes",
  "expert_sessions", "ideas", "roles", "projects", "pipeline_snapshots",
];
const SYNTAX_BLOCKLIST = /\b(DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|DO|COPY|CALL)\b/i;

/** Matches an unquoted identifier (\w+) or a double-quoted identifier ("...") */
const IDENT = /(?:(\w+)|"([^"]+)")/;

/** Extract table names referenced via FROM, INTO, UPDATE, JOIN, DELETE FROM */
function extractTableNames(sql: string): string[] {
  const keywords = ["FROM", "INTO", "UPDATE", "JOIN"];
  const tables = new Set<string>();
  for (const kw of keywords) {
    const pattern = new RegExp(`\\b${kw}\\s+${IDENT.source}`, "gi");
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const name = (match[1] ?? match[2]).toLowerCase();
      tables.add(name);
    }
  }
  // Also handle DELETE FROM specifically (two-keyword prefix)
  const delPattern = new RegExp(`\\bDELETE\\s+FROM\\s+${IDENT.source}`, "gi");
  let dm;
  while ((dm = delPattern.exec(sql)) !== null) {
    const name = (dm[1] ?? dm[2]).toLowerCase();
    tables.add(name);
  }
  return [...tables];
}

/** Detect if the SQL references tables via keywords but we extracted none — signals an evasion attempt */
function hasUnextractableTableRef(sql: string): boolean {
  const tableKeywords = /\b(FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\b/i;
  return tableKeywords.test(sql);
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
    const { sql, expected_affected_rows, job_id } = body as {
      sql: string;
      expected_affected_rows?: number;
      job_id?: string;
    };

    if (!sql || typeof sql !== "string") {
      return jsonResponse({ error: "sql is required and must be a string" }, 400);
    }

    // --- Syntax blocklist ---
    if (SYNTAX_BLOCKLIST.test(sql)) {
      return jsonResponse(
        { error: "SQL contains blocked syntax (DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, DO, COPY, CALL)" },
        400,
      );
    }

    // --- Table allowlist ---
    const tables = extractTableNames(sql);
    if (tables.length === 0 && hasUnextractableTableRef(sql)) {
      return jsonResponse(
        { error: "SQL references tables but none could be extracted — possible identifier evasion" },
        400,
      );
    }
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

    // --- Audit log ---
    try {
      await supabase.from("agent_events").insert({
        job_id: job_id ?? null,
        event_type: "sql_executed",
        payload: {
          sql,
          tables,
          affected_rows,
          expected_affected_rows: expected_affected_rows ?? null,
        },
      });
    } catch (_auditErr) {
      // Non-blocking — don't fail the response if audit insert fails
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
