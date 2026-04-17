import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DigestData } from "../_shared/digest-template.ts";
import { renderWeeklyDigest } from "../_shared/digest-template.ts";
import { sendEmail } from "../_shared/resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DIGEST_FROM_ADDRESS = "Zazig <digest@zazig.com>";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY",
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompanyRow {
  id: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isMissingStatusColumn(error: unknown): boolean {
  const err = asRecord(error);
  if (!err) return false;

  const code = asString(err.code);
  const message = [asString(err.message), asString(err.details), asString(err.hint)]
    .filter((part): part is string => !!part)
    .join(" ")
    .toLowerCase();

  return code === "42703" || (message.includes("status") && message.includes("column"));
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(raw);
  const record = asRecord(parsed);
  if (!record) {
    throw new Error("Request body must be a JSON object");
  }

  return record;
}

async function loadCompanyIds(
  supabase: SupabaseClient,
  scopedCompanyId: string | null,
): Promise<string[]> {
  if (scopedCompanyId) {
    return [scopedCompanyId];
  }

  const { data: activeCompanies, error: activeError } = await supabase
    .from("companies")
    .select("id")
    .eq("status", "active");

  if (activeError) {
    if (!isMissingStatusColumn(activeError)) {
      throw new Error(`Failed to query active companies: ${activeError.message}`);
    }

    const { data: allCompanies, error: allError } = await supabase
      .from("companies")
      .select("id");

    if (allError) {
      throw new Error(`Failed to query companies: ${allError.message}`);
    }

    return (allCompanies ?? [])
      .map((company) => asString((company as CompanyRow).id))
      .filter((id): id is string => !!id);
  }

  return (activeCompanies ?? [])
    .map((company) => asString((company as CompanyRow).id))
    .filter((id): id is string => !!id);
}

function parseShippedFeatures(value: unknown): DigestData["shippedFeatures"] {
  return asArray(value)
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;

      const title = asString(row.title);
      if (!title) return null;

      return {
        title,
        promotedVersion: asString(row.promoted_version),
      };
    })
    .filter(
      (feature): feature is { title: string; promotedVersion: string | null } =>
        !!feature,
    );
}

function parseFailedJobs(value: unknown): DigestData["failedJobs"] {
  return asArray(value)
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;

      const title = asString(row.title);
      if (!title) return null;

      return {
        title,
        featureTitle: asString(row.feature_title) ?? "unknown feature",
      };
    })
    .filter(
      (job): job is { title: string; featureTitle: string } =>
        !!job,
    );
}

async function fetchRecentCompletedFeatures(
  supabase: SupabaseClient,
  companyId: string,
  weekStartIso: string,
): Promise<DigestData["shippedFeatures"]> {
  const { data, error } = await supabase
    .from("features")
    .select("title, promoted_version, updated_at")
    .eq("company_id", companyId)
    .eq("status", "complete")
    .gte("updated_at", weekStartIso)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to query features for company ${companyId}: ${error.message}`);
  }

  return (data ?? [])
    .map((feature) => {
      const title = asString((feature as Record<string, unknown>).title);
      if (!title) return null;

      return {
        title,
        promotedVersion: asString((feature as Record<string, unknown>).promoted_version),
      };
    })
    .filter(
      (feature): feature is { title: string; promotedVersion: string | null } =>
        !!feature,
    );
}

function buildDigestData(payload: Record<string, unknown>, weekEnding: string): DigestData {
  const shippedFeatures = parseShippedFeatures(payload.shipped_features);
  const failedJobs = parseFailedJobs(payload.failed_jobs);
  const mergedPrCount = asInteger(payload.merged_pr_count) ?? shippedFeatures.length;

  return {
    weekEnding,
    shippedFeatures,
    mergedPrCount,
    failedJobs,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed — use POST" }, 405);
  }

  const token = parseBearerToken(req.headers.get("Authorization"));
  if (!token) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Forbidden: invalid service role authorization" }, 403);
  }

  const weekEnding = new Date().toISOString().slice(0, 10);
  const weekStartIso = new Date(Date.now() - ONE_WEEK_MS).toISOString();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const body = await parseBody(req);
    const url = new URL(req.url);
    const companyId =
      asString(url.searchParams.get("company_id")) ?? asString(body.company_id);

    const supabase = makeAdminClient();
    const companyIds = await loadCompanyIds(supabase, companyId);

    for (const currentCompanyId of companyIds) {
      try {
        const { data: digestRpcData, error: digestError } = await supabase.rpc(
          "get_weekly_digest_data",
          { p_company_id: currentCompanyId },
        );

        if (digestError) {
          errors += 1;
          console.error(
            `[send-weekly-digest] failed to load digest data for company ${currentCompanyId}:`,
            digestError.message,
          );
          continue;
        }

        const payload = asRecord(digestRpcData) ?? {};
        const founderEmail = asString(payload.founder_email);
        if (!founderEmail) {
          skipped += 1;
          console.log(
            `[send-weekly-digest] skipped company ${currentCompanyId}: founder_email is null`,
          );
          continue;
        }

        let digestData = buildDigestData(payload, weekEnding);
        if (digestData.shippedFeatures.length === 0) {
          const fallbackShippedFeatures = await fetchRecentCompletedFeatures(
            supabase,
            currentCompanyId,
            weekStartIso,
          );
          digestData = { ...digestData, shippedFeatures: fallbackShippedFeatures };
        }

        if (!digestData.shippedFeatures.length) {
          skipped += 1;
          console.log(
            `[send-weekly-digest] skipped company ${currentCompanyId}: no complete features in past 7 days`,
          );
          continue;
        }

        const { subject, html, text } = renderWeeklyDigest(digestData);
        await sendEmail({
          to: founderEmail,
          subject,
          html,
          text,
        });

        sent += 1;
        console.log(
          `[send-weekly-digest] sent weekly digest to ${founderEmail} for company ${currentCompanyId} from ${DIGEST_FROM_ADDRESS}`,
        );
      } catch (companyError) {
        errors += 1;
        console.error(
          `[send-weekly-digest] failed company ${currentCompanyId}:`,
          companyError,
        );
      }
    }

    const emailsSent = sent;
    console.log(
      `[send-weekly-digest] completed run: ${emailsSent} emails sent, ${skipped} skipped, ${errors} errors`,
    );

    return jsonResponse({ sent, skipped, errors }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-weekly-digest] unhandled error:", message);
    return jsonResponse({ error: message, sent, skipped, errors }, 500);
  }
});
