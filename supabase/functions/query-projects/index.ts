import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

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

const PROJECT_SELECT_BASE = "id,name,description,status,repo_url";
const PROJECT_SELECT_WITH_FEATURES =
  "id,name,description,status,repo_url,features(id,title,description,priority,status)";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const {
      company_id,
      limit = 20,
      offset = 0,
      include_features = false,
    } = body as {
      company_id?: string;
      limit?: number;
      offset?: number;
      include_features?: boolean;
    };

    if (!company_id) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }

    const select = include_features
      ? PROJECT_SELECT_WITH_FEATURES
      : PROJECT_SELECT_BASE;

    const { data, error, count } = await supabase
      .from("projects")
      .select(select, { count: "exact" })
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ projects: data ?? [], total: count ?? 0 });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
