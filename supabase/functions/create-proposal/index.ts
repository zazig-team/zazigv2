import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
      title,
      content,
      client_name,
      client_logo_url,
      client_brand_color,
      prepared_by,
      allowed_emails,
      pricing,
      valid_until,
    } = body;

    // Validate required fields
    if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);
    if (!title) return jsonResponse({ error: "title is required" }, 400);
    if (!client_name) return jsonResponse({ error: "client_name is required" }, 400);
    if (!prepared_by) return jsonResponse({ error: "prepared_by is required" }, 400);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    const { data, error } = await supabase
      .from("proposals")
      .insert({
        company_id,
        title,
        content: content ?? { sections: [] },
        client_name,
        client_logo_url: client_logo_url ?? null,
        client_brand_color: client_brand_color ?? null,
        prepared_by,
        allowed_emails: allowed_emails ?? [],
        pricing: pricing ?? {},
        valid_until: valid_until ?? null,
        created_by: user?.id ?? null,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) return jsonResponse({ error: error.message }, 500);

    // Emit event
    await supabase.from("events").insert({
      company_id,
      event_type: "proposal_created",
      payload: { proposal_id: data.id, client_name, title },
    });

    return jsonResponse({ id: data.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
