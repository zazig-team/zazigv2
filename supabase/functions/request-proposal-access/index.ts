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

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user?.email) {
      return jsonResponse({ error: "Invalid auth token" }, 401);
    }

    const body = await req.json();
    const { proposal_id } = body;
    if (!proposal_id) {
      return jsonResponse({ error: "proposal_id is required" }, 400);
    }

    // Get proposal to find owner
    const { data: proposal, error } = await supabase
      .from("proposals")
      .select("id, company_id, title, client_name, created_by")
      .eq("id", proposal_id)
      .single();

    if (error || !proposal) {
      return jsonResponse({ error: "Proposal not found" }, 404);
    }

    // Log access request as event
    await supabase.from("events").insert({
      company_id: proposal.company_id,
      event_type: "proposal_access_requested",
      payload: {
        proposal_id: proposal.id,
        requester_email: user.email,
        proposal_title: proposal.title,
      },
    });

    // Resend notification deferred to Task 12 (Resend Integration).
    // For now, the event log + dashboard visibility is sufficient.

    return jsonResponse({ requested: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
