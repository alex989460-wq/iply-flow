import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CRM_URL = Deno.env.get("CRM_SUPABASE_URL") || "https://zapcrm.top";
const GRACE_DAYS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: resellers, error } = await admin
      .from("reseller_access")
      .select("user_id, full_name, access_expires_at, is_active");
    if (error) throw error;

    const keys = new Map<string, string>();
    const { data: settings } = await admin
      .from("crm_oficial_settings")
      .select("user_id, api_key");
    for (const s of settings ?? []) {
      if (s.api_key) keys.set(s.user_id, s.api_key as string);
    }

    let pushed = 0;
    const failed: string[] = [];

    for (const r of resellers ?? []) {
      const apiKey = keys.get(r.user_id);
      if (!apiKey) continue;

      // Admins e contas sem vencimento nunca são desconectados.
      const { data: isAdmin } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", r.user_id)
        .eq("role", "admin")
        .maybeSingle();
      if (isAdmin) continue;

      const dueDate = r.access_expires_at
        ? new Date(r.access_expires_at).toISOString().slice(0, 10)
        : null;

      try {
        const res = await fetch(`${CRM_URL}/api/public/v1/account-billing`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            due_date: dueDate,
            grace_days: GRACE_DAYS,
            auto_suspend: !!dueDate,
          }),
        });
        if (!res.ok) {
          failed.push(`${r.user_id}: ${res.status} ${await res.text()}`);
        } else {
          pushed += 1;
        }
      } catch (e) {
        failed.push(`${r.user_id}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, pushed, failed_count: failed.length, failed: failed.slice(0, 10) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
