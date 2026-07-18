// Public endpoint: given a slug + phone, returns customers matching that phone
// for the reseller. No sensitive data leaks — returns id, name (masked), username,
// due_date, status, current plan name.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function digits(s: string) { return String(s || "").replace(/\D/g, ""); }
function phoneVariants(raw: string): string[] {
  const d = digits(raw);
  if (!d) return [];
  const set = new Set<string>([d]);
  if (d.startsWith("55") && d.length >= 12) set.add(d.slice(2));
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) set.add("55" + d);
  // Also last-9-digit fuzzy fallback (BR mobiles).
  if (d.length >= 9) set.add(d.slice(-9));
  return Array.from(set);
}
function maskName(name: string) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.map((p, i) => (i === 0 ? p : (p[0] ? p[0] + "***" : ""))).join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({} as any));
    const slug = String(body.slug || "").trim().toLowerCase();
    const phoneRaw = String(body.phone || "");
    if (!slug || !phoneRaw) return json({ error: "missing_params" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, is_active")
      .eq("slug", slug)
      .maybeSingle();
    if (!settings || !settings.is_active) return json({ error: "not_found" }, 404);

    const variants = phoneVariants(phoneRaw);
    if (variants.length === 0) return json({ customers: [] });

    // Try exact matches first with OR filter, then a fuzzy suffix match with last 9 digits.
    const orExact = variants.map((v) => `phone.eq.${v},extra_phone.eq.${v}`).join(",");
    const last9 = digits(phoneRaw).slice(-9);
    const orFuzzy = last9.length >= 8 ? `,phone.ilike.%${last9},extra_phone.ilike.%${last9}` : "";

    const { data: customers } = await admin
      .from("customers")
      .select("id, checkout_code, name, username, due_date, status, plan_id, screens, plans:plan_id(plan_name)")
      .eq("created_by", settings.user_id)
      .or(orExact + orFuzzy)
      .limit(20);

    return json({
      customers: (customers || []).map((c: any) => ({
        id: c.id,
        checkout_code: c.checkout_code,
        name: maskName(c.name),
        username: c.username,
        due_date: c.due_date,
        status: c.status,
        screens: c.screens,
        current_plan: c.plans?.plan_name || null,
      })),
    });
  } catch (err) {
    console.error("[reseller-checkout-lookup]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
