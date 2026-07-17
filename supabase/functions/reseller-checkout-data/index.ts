// Public endpoint: returns the reseller's checkout config + plans for a given slug.
// GET  /reseller-checkout-data?slug=xxx
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
    if (!slug) return json({ error: "slug_required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, slug, display_name, logo_url, brand_color, headline, subheadline, enable_efi, enable_cakto, is_active, activation_cakto_url")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!settings) return json({ error: "not_found" }, 404);

    const ownerId = settings.user_id;

    // Efí availability for this owner.
    const { data: efi } = await admin
      .from("efi_settings")
      .select("enabled, pix_key, client_id, cert_p12_base64, environment")
      .eq("user_id", ownerId)
      .maybeSingle();
    const efi_ready = !!(efi?.enabled && efi.pix_key && efi.client_id && efi.cert_p12_base64);

    // Plans of this reseller.
    const { data: plans } = await admin
      .from("plans")
      .select("id, plan_name, duration_days, price, checkout_url, card_checkout_url")
      .eq("created_by", ownerId)
      .order("price", { ascending: true });

    // Activation apps configured by this reseller (public listing).
    const { data: apps } = await admin
      .from("activation_apps")
      .select("id, app_name, description, logo_url, icon, requires_mac, requires_email, sort_order, price_monthly, price_quarterly, price_annual")
      .eq("user_id", ownerId)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });

    return json({
      slug: settings.slug,
      display_name: settings.display_name,
      logo_url: settings.logo_url,
      brand_color: settings.brand_color,
      headline: settings.headline,
      subheadline: settings.subheadline,
      activation_cakto_url: settings.activation_cakto_url || null,
      methods: {
        efi: settings.enable_efi && efi_ready,
        cakto: settings.enable_cakto,
      },
      plans: (plans || []).map((p: any) => ({
        id: p.id,
        name: p.plan_name,
        duration_days: p.duration_days,
        price: Number(p.price),
        cakto_url: p.checkout_url || null,
        card_url: p.card_checkout_url || null,
      })),
      apps: (apps || []).map((a: any) => ({
        id: a.id,
        name: a.app_name,
        description: a.description,
        logo_url: a.logo_url,
        icon: a.icon,
        requires_mac: !!a.requires_mac,
        requires_email: !!a.requires_email,
        price_monthly: a.price_monthly != null ? Number(a.price_monthly) : null,
        price_quarterly: a.price_quarterly != null ? Number(a.price_quarterly) : null,
        price_annual: a.price_annual != null ? Number(a.price_annual) : null,
      })),
    });
  } catch (err) {
    console.error("[reseller-checkout-data]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
