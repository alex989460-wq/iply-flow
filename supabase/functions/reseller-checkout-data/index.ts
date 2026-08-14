// Public endpoint: returns the reseller's checkout config + plans for a given slug.
// GET  /reseller-checkout-data?slug=xxx
// POST /reseller-checkout-data { action: "register", slug, name, phone, username, server_id? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function saoPauloDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ---------- POST: cadastro público de novo assinante ----------
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as any));
      const action = String(body.action || "register");
      const slug = String(body.slug || "").trim().toLowerCase();
      if (!slug) return json({ error: "Link de checkout inválido." }, 400);

      const { data: st } = await admin
        .from("reseller_checkout_settings")
        .select("user_id, is_active")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (!st) return json({ error: "Revendedor não encontrado." }, 404);

      if (action !== "register") return json({ error: "Ação inválida." }, 400);

      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").replace(/\D/g, "");
      const username = String(body.username || "").trim();
      const serverId = String(body.server_id || "").trim() || null;
      if (!name || !phone || !username) {
        return json({ error: "Preencha nome, WhatsApp e usuário desejado." }, 400);
      }

      if (serverId) {
        const { data: ownedServer } = await admin.from("servers").select("id").eq("id", serverId).eq("created_by", st.user_id).maybeSingle();
        if (!ownedServer) return json({ error: "Servidor inválido para este revendedor." }, 400);
      }

      const today = saoPauloDate();
      const { data: existing } = await admin
        .from("customers")
        .select("id, status")
        .eq("created_by", st.user_id)
        .ilike("username", username)
        .maybeSingle();
      if (existing?.status === "ativa") {
        return json({ error: "Esse usuário já possui uma assinatura ativa. Use a opção Já sou cliente." }, 409);
      }

      let customerId = existing?.id || "";
      if (existing) {
        const { error: updateError } = await admin.from("customers").update({
          name, phone, server_id: serverId,
        }).eq("id", existing.id).eq("created_by", st.user_id);
        if (updateError) return json({ error: `Não foi possível atualizar o cadastro: ${updateError.message}` }, 400);
      } else {
        const { data: customer, error: customerError } = await admin.from("customers").insert({
          created_by: st.user_id, name, phone, username, server_id: serverId,
          start_date: today, due_date: today, status: "inativa",
        }).select("id").single();
        if (customerError) return json({ error: `Não foi possível cadastrar o cliente: ${customerError.message}` }, 400);
        customerId = customer.id;
      }

      const { data: pending } = await admin.from("pending_new_customers")
        .select("id")
        .eq("owner_id", st.user_id)
        .ilike("username", username)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const pendingQuery = pending
        ? admin.from("pending_new_customers").update({ name, phone, server_id: serverId }).eq("id", pending.id).select("id").single()
        : admin.from("pending_new_customers").insert({ owner_id: st.user_id, name, phone, username, server_id: serverId }).select("id").single();
      const { data: inserted, error } = await pendingQuery;

      if (error) {
        if (!existing && customerId) await admin.from("customers").delete().eq("id", customerId).eq("created_by", st.user_id);
        return json({ error: `Não foi possível concluir o cadastro: ${error.message}` }, 400);
      }

      return json({ ok: true, id: inserted.id, customer_id: customerId, phone });
    }

    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
    if (!slug) return json({ error: "slug_required" }, 400);

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

    // Servers of this reseller (public listing for new customer registration).
    const { data: allServers } = await admin
      .from("servers")
      .select("id, server_name, status, is_public")
      .eq("created_by", ownerId)
      .order("server_name", { ascending: true });

    // Só aparecem no checkout os servidores marcados como "Visível na Página de Checkout".
    // Se o revendedor ainda não marcou nenhum, mantém o comportamento antigo (mostra todos).
    const publicServers = (allServers || []).filter((s: any) => s.is_public === true);
    const servers = publicServers.length > 0 ? publicServers : (allServers || []);

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
      servers: (servers || [])
        .filter((s: any) => s.status !== "manutencao")
        .map((s: any) => ({ id: s.id, name: s.server_name })),
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
