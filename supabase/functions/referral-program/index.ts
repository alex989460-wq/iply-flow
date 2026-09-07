// Endpoint público do Programa de Indicação usado no checkout do revendedor.
//   action = "resolve" { slug, code }        -> dados de quem indicou (para a landing)
//   action = "panel"   { slug, customer_id } -> código, link, saldo e histórico do cliente
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getReferralSettings, getReferralBalance, ensureReferralCode, cleanCode } from "../_shared/referral.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function maskName(name: string) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.map((p, i) => (i === 0 ? p : p[0] ? `${p[0]}***` : "")).join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as any));
    const slug = String(body.slug || "").trim().toLowerCase();
    const action = String(body.action || "resolve");
    if (!slug) return json({ error: "slug_required" }, 400);

    const { data: st } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, is_active")
      .eq("slug", slug)
      .maybeSingle();
    if (!st || !st.is_active) return json({ error: "not_found" }, 404);

    const ownerId = st.user_id;
    const settings = await getReferralSettings(admin, ownerId);
    if (!settings.enabled) return json({ ok: true, enabled: false });

    if (action === "resolve") {
      const code = cleanCode(body.code);
      if (!code) return json({ error: "code_required" }, 400);
      const { data: referrer } = await admin
        .from("customers")
        .select("id, name")
        .eq("created_by", ownerId)
        .eq("referral_code", code)
        .maybeSingle();
      if (!referrer) return json({ ok: false, enabled: true, error: "Código de indicação inválido." }, 404);
      return json({
        ok: true,
        enabled: true,
        referrer_name: maskName(referrer.name || ""),
        referee_discount: Number(settings.referee_discount || 0),
        reward_amount: Number(settings.reward_amount || 0),
        headline: settings.headline,
        terms: settings.terms,
      });
    }

    if (action === "panel") {
      const customerId = String(body.customer_id || "");
      if (!customerId) return json({ error: "customer_id_required" }, 400);
      const { data: customer } = await admin
        .from("customers")
        .select("id, name, referral_code, created_by")
        .eq("id", customerId)
        .eq("created_by", ownerId)
        .maybeSingle();
      if (!customer) return json({ error: "not_found" }, 404);

      const code = await ensureReferralCode(admin, customer);
      const [balance, list] = await Promise.all([
        getReferralBalance(admin, customer.id),
        admin
          .from("referrals")
          .select("id, referee_name, status, reward_amount, created_at")
          .eq("referrer_customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const rows = (list as any)?.data || [];
      return json({
        ok: true,
        enabled: true,
        code,
        balance,
        reward_amount: Number(settings.reward_amount || 0),
        referee_discount: Number(settings.referee_discount || 0),
        max_discount_percent: Number(settings.max_discount_percent || 50),
        max_rewards_per_month: Number(settings.max_rewards_per_month || 10),
        headline: settings.headline,
        terms: settings.terms,
        total: rows.length,
        rewarded: rows.filter((r: any) => r.status === "rewarded").length,
        pending: rows.filter((r: any) => r.status === "pending").length,
        referrals: rows.map((r: any) => ({
          name: maskName(r.referee_name || "Cliente"),
          status: r.status,
          reward: Number(r.reward_amount || 0),
          created_at: r.created_at,
        })),
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[referral-program]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
