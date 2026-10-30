import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Sign in is required." });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const notifyEmail = Deno.env.get("POINTS_NOTIFY_EMAIL");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!resendKey || !notifyEmail || !fromEmail) {
    return reply(503, { error: "Email notifications are not configured yet.", code: "EMAIL_NOT_CONFIGURED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  let publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (publishableKeysRaw) {
    try {
      const keys = JSON.parse(publishableKeysRaw);
      publishableKey = keys.default || publishableKey;
    } catch {
      return reply(500, { error: "Server authentication is unavailable." });
    }
  }
  if (!supabaseUrl || !publishableKey) return reply(500, { error: "Server authentication is unavailable." });

  let body: { claimId?: string };
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "Invalid request body." });
  }
  const claimId = typeof body.claimId === "string" ? body.claimId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimId)) {
    return reply(400, { error: "A valid mission submission ID is required." });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult.user) return reply(401, { error: "Your sign-in session is not valid. Please sign in again." });

  const { data: claim, error: claimError } = await userClient
    .from("point_claims")
    .select("id,user_id,mission_id,proof_text,proof_url,created_at,status")
    .eq("id", claimId)
    .eq("user_id", userResult.user.id)
    .single();
  if (claimError || !claim) return reply(404, { error: "This mission submission could not be found." });
  if (claim.status !== "pending") return reply(409, { error: "Only pending mission submissions can trigger a review email." });

  const [missionResult, profileResult] = await Promise.all([
    userClient.from("point_missions").select("title,points").eq("id", claim.mission_id).maybeSingle(),
    userClient.from("profiles").select("display_name,username").eq("id", userResult.user.id).maybeSingle(),
  ]);
  const memberName = profileResult.data?.display_name || "Gendev member";
  const handle = profileResult.data?.username ? "@" + profileResult.data.username : "No public handle";
  const missionTitle = missionResult.data?.title || claim.mission_id;
  const points = Number(missionResult.data?.points) || 0;
  const proof = String(claim.proof_text || "");
  const evidence = typeof claim.proof_url === "string" && claim.proof_url.startsWith("https://") ? claim.proof_url : "";
  const subject = "New Gendev points submission: " + missionTitle;
  const textBody = [
    "A new Gendev points mission was submitted for review.",
    "",
    "Member: " + memberName + " (" + handle + ")",
    "Mission: " + missionTitle,
    "Points if approved: " + points,
    "Submitted: " + new Date(claim.created_at).toISOString(),
    "",
    "Proof:",
    proof,
    evidence ? "Evidence link: " + evidence : "No evidence link was included.",
    "",
    "Submission ID: " + claim.id,
    "Review the pending claim in the Supabase point_claims table.",
  ].join("\n");

  const htmlBody =
    "<h2>New Gendev points submission</h2>" +
    "<p><strong>Member:</strong> " + escapeHtml(memberName) + " (" + escapeHtml(handle) + ")</p>" +
    "<p><strong>Mission:</strong> " + escapeHtml(missionTitle) + "</p>" +
    "<p><strong>Points if approved:</strong> " + points + "</p>" +
    "<p><strong>Submitted:</strong> " + escapeHtml(new Date(claim.created_at).toISOString()) + "</p>" +
    "<h3>Proof</h3><p>" + escapeHtml(proof).replace(/\n/g, "<br>") + "</p>" +
    (evidence ? '<p><a href="' + escapeHtml(evidence) + '">Open evidence link</a></p>' : "<p>No evidence link was included.</p>") +
    "<p><strong>Submission ID:</strong> " + escapeHtml(claim.id) + "</p>" +
    "<p>Review the pending claim in the Supabase point_claims table. Do not award points until proof has been checked.</p>";

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + resendKey,
      "Content-Type": "application/json",
      "Idempotency-Key": "gendev-points-" + claim.id,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [notifyEmail],
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });
  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    console.error("Resend email delivery failed:", emailResponse.status, errorText.slice(0, 1000));
    return reply(502, { error: "The submission was saved, but its review email could not be sent." });
  }
  return reply(200, { sent: true });
});
