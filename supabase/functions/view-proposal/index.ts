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
    const url = new URL(req.url);
    const proposalId = url.searchParams.get("id");
    if (!proposalId) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Always return public gate data (no auth required)
    const { data: proposal, error } = await supabase
      .from("proposals")
      .select(
        "id, title, client_name, client_logo_url, client_brand_color, prepared_by, created_at, valid_until, status",
      )
      .eq("id", proposalId)
      .single();

    if (error || !proposal) {
      return jsonResponse({ error: "Proposal not found" }, 404);
    }

    // Check if proposal is expired
    if (
      proposal.valid_until &&
      new Date(proposal.valid_until) < new Date()
    ) {
      return jsonResponse({
        gate: {
          title: proposal.title,
          client_name: proposal.client_name,
          client_logo_url: proposal.client_logo_url,
          client_brand_color: proposal.client_brand_color,
          prepared_by: proposal.prepared_by,
          created_at: proposal.created_at,
        },
        expired: true,
      });
    }

    // Check for auth — if no auth header, return gate data only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({
        gate: {
          title: proposal.title,
          client_name: proposal.client_name,
          client_logo_url: proposal.client_logo_url,
          client_brand_color: proposal.client_brand_color,
          prepared_by: proposal.prepared_by,
          created_at: proposal.created_at,
        },
        authenticated: false,
      });
    }

    // Verify the JWT and extract email
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user?.email) {
      return jsonResponse({
        gate: {
          title: proposal.title,
          client_name: proposal.client_name,
          client_logo_url: proposal.client_logo_url,
          client_brand_color: proposal.client_brand_color,
          prepared_by: proposal.prepared_by,
          created_at: proposal.created_at,
        },
        authenticated: false,
      });
    }

    const email = user.email.toLowerCase();

    // Check access: @zazig.com or in allowed_emails
    const { data: fullProposal } = await supabase
      .from("proposals")
      .select("*")
      .eq("id", proposalId)
      .single();

    const allowedEmails = (fullProposal?.allowed_emails ?? []).map(
      (e: string) => e.toLowerCase(),
    );
    const isZazig = email.endsWith("@zazig.com");
    const isAllowed = allowedEmails.includes(email);

    if (!isZazig && !isAllowed) {
      return jsonResponse({
        gate: {
          title: proposal.title,
          client_name: proposal.client_name,
          client_logo_url: proposal.client_logo_url,
          client_brand_color: proposal.client_brand_color,
          prepared_by: proposal.prepared_by,
          created_at: proposal.created_at,
        },
        authenticated: true,
        authorized: false,
        email: email,
      });
    }

    // Record view
    await supabase.from("proposal_views").insert({
      proposal_id: proposalId,
      viewer_email: email,
    });

    // Set viewed_at if first view
    if (!fullProposal?.viewed_at) {
      await supabase
        .from("proposals")
        .update({ viewed_at: new Date().toISOString(), status: "viewed" })
        .eq("id", proposalId)
        .eq("status", "sent");
    }

    return jsonResponse({
      proposal: {
        id: fullProposal!.id,
        title: fullProposal!.title,
        content: fullProposal!.content,
        client_name: fullProposal!.client_name,
        client_logo_url: fullProposal!.client_logo_url,
        client_brand_color: fullProposal!.client_brand_color,
        prepared_by: fullProposal!.prepared_by,
        pricing: fullProposal!.pricing,
        valid_until: fullProposal!.valid_until,
        created_at: fullProposal!.created_at,
      },
      authenticated: true,
      authorized: true,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
