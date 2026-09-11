// Loja de créditos.
// - Cada revendedor cadastra a SUA tabela de valores por servidor (credit_price_tiers.owner_id).
// - Cada revendedor tem o seu link público (/c/:slug), igual ao checkout, onde os
//   clientes/sub-revendas compram créditos e recebem automaticamente após o Pix.
// - O Pix é gerado nas credenciais (Efí/Mercado Pago) do próprio revendedor vendedor.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCredentials, createCharge, getQrCode, newTxid } from "../_shared/efi-client.ts";
import { createPixPayment } from "../_shared/mercadopago-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const stripDataPrefix = (v: string) => String(v || "").replace(/^data:image\/\w+;base64,/, "");

const onlyDigits = (v: string) => String(v || "").replace(/\D/g, "");

export function priceFor(tiers: any[], qty: number): { unit: number; tier: any } | null {
  const active = (tiers || []).filter((t) => t.is_active !== false);
  const exact = active.find((t) => qty >= Number(t.min_qty) && qty <= Number(t.max_qty));
  if (exact) return { unit: Number(exact.unit_price), tier: exact };
  const sorted = [...active].sort((a, b) => Number(b.max_qty) - Number(a.max_qty));
  if (sorted.length && qty > Number(sorted[0].max_qty)) {
    return { unit: Number(sorted[0].unit_price), tier: sorted[0] };
  }
  return null;
}

/**
 * Lê a tabela colada em um único campo. Aceita formatos como:
 *   10 a 19 = 8,00
 *   20-49 R$ 7,00
 *   50 A 299  6
 *   300 a 1000 = R$5,00
 */
export function parseTierText(text: string): { min_qty: number; max_qty: number; unit_price: number }[] {
  const out: { min_qty: number; max_qty: number; unit_price: number }[] = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(
      /(\d[\d.]*)\s*(?:a|à|-|até|ate|\/)\s*(\d[\d.]*)\D+?(\d+(?:[.,]\d{1,2})?)\s*$/i,
    );
    if (!m) continue;
    const min = parseInt(m[1].replace(/\D/g, ""), 10);
    const max = parseInt(m[2].replace(/\D/g, ""), 10);
    const price = Number(m[3].replace(/\./g, "").replace(",", "."));
    if (!isFinite(min) || !isFinite(max) || !isFinite(price) || price <= 0 || max < min) continue;
    out.push({ min_qty: min, max_qty: max, unit_price: Number(price.toFixed(2)) });
  }
  return out.sort((a, b) => a.min_qty - b.min_qty);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const findSellerBySlug = async (slug: string) => {
    const { data } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, slug, display_name, logo_url, brand_color, headline, subheadline, is_active, enable_efi, enable_mercadopago")
      .eq("slug", slug)
      .maybeSingle();
    return data;
  };

  // Identifica o comprador pelo usuário do painel, telefone ou e-mail.
  const identifyBuyer = async (opts: { panelUsername?: string; phone?: string; email?: string }) => {
    const user = String(opts.panelUsername || "").trim();
    const phone = onlyDigits(String(opts.phone || ""));
    const email = String(opts.email || "").trim().toLowerCase();

    if (user) {
      const cols = [
        "vplay_panel_username", "rush_username", "uniplay_username",
        "the_best_username", "p2cine_username", "sigma_username",
      ];
      const { data: api } = await admin
        .from("reseller_api_settings")
        .select(`user_id, ${cols.join(", ")}`)
        .or(cols.map((c) => `${c}.ilike.${user}`).join(","))
        .limit(1)
        .maybeSingle();
      if ((api as any)?.user_id) {
        const { data: acc } = await admin
          .from("reseller_access").select("user_id, email, full_name").eq("user_id", (api as any).user_id).maybeSingle();
        if (acc?.user_id) return acc;
      }
    }

    if (phone) {
      const tail = phone.slice(-8);
      const { data: byPhone } = await admin
        .from("reseller_access").select("user_id, email, full_name, phone").not("phone", "is", null).limit(500);
      const hit = (byPhone || []).find((r: any) => onlyDigits(r.phone).endsWith(tail));
      if (hit?.user_id) return hit;
    }

    if (email) {
      const { data: byEmail } = await admin
        .from("reseller_access").select("user_id, email, full_name").ilike("email", email).maybeSingle();
      if (byEmail?.user_id) return byEmail;
    }
    return null;
  };

  const buildOrder = async (opts: {
    sellerId: string;
    buyerId: string | null;
    buyerEmail: string | null;
    serverId: string;
    qty: number;
    provider: "efi" | "mercadopago";
    panelUsername?: string | null;
    buyerPhone?: string | null;
  }) => {
    const { sellerId, buyerId, buyerEmail, serverId, qty, provider } = opts;
    const panelUsername = opts.panelUsername || null;
    const buyerPhone = opts.buyerPhone || null;
    const [{ data: server }, { data: tiers }] = await Promise.all([
      admin.from("servers").select("id, server_name").eq("id", serverId).maybeSingle(),
      admin.from("credit_price_tiers").select("*").eq("server_id", serverId).eq("owner_id", sellerId).eq("is_active", true),
    ]);
    if (!server) return json({ error: "servidor_invalido" }, 400);
    const found = priceFor(tiers || [], qty);
    if (!found) return json({ error: "sem_faixa", message: "Nenhuma faixa de preço cobre essa quantidade." }, 400);
    const total = Number((found.unit * qty).toFixed(2));

    let efiSettings: any = null;
    let mpSettings: any = null;
    if (provider === "efi") {
      const { data } = await admin.from("efi_settings").select("*").eq("user_id", sellerId).eq("enabled", true).maybeSingle();
      efiSettings = data;
      if (!efiSettings) return json({ error: "efi_nao_configurado", message: "O Pix Efí não está configurado para este vendedor." }, 400);
    } else {
      const { data } = await admin.from("mercadopago_settings").select("*").eq("user_id", sellerId).eq("enabled", true).maybeSingle();
      mpSettings = data;
      if (!mpSettings?.access_token) return json({ error: "mp_nao_configurado", message: "O Mercado Pago não está configurado para este vendedor." }, 400);
    }

    const { data: order, error: orderErr } = await admin
      .from("credit_orders")
      .insert({
        buyer_id: buyerId,
        buyer_email: buyerEmail,
        panel_username: panelUsername,
        buyer_phone: buyerPhone,
        seller_id: sellerId,
        server_id: server.id,
        server_name: server.server_name,
        quantity: qty,
        unit_price: found.unit,
        total,
        provider,
        status: "pending",
      })
      .select("*")
      .single();
    if (orderErr) throw orderErr;

    const description = `${qty} créditos — ${server.server_name}`;
    const txid = newTxid();

    if (provider === "mercadopago") {
      const payment = await createPixPayment(mpSettings, {
        amount: total,
        description,
        externalReference: txid,
        notificationUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        payerEmail: buyerEmail || undefined,
        expiresInSec: 86400,
      });
      if (!payment.ok || !payment.id) {
        await admin.from("credit_orders").update({ status: "failed", delivery_error: "mercadopago_falhou" }).eq("id", order.id);
        return json({ error: "mercadopago_falhou", message: payment.body?.message || "Não foi possível gerar o Pix." }, 400);
      }
      await admin.from("efi_charges").insert({
        owner_id: sellerId,
        customer_id: null,
        pending_id: order.id,
        pending_kind: "credit_order",
        txid,
        amount: total,
        environment: String(mpSettings.environment || "production"),
        provider: "mercadopago",
        provider_payment_id: payment.id,
        pix_copia_cola: payment.qrCode || "",
        qrcode_base64: stripDataPrefix(payment.qrCodeBase64 || ""),
        metadata: { description, source: "credit_order", buyer_id: buyerId, buyer_email: buyerEmail, panel_username: panelUsername, buyer_phone: buyerPhone },
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      });
      await admin.from("credit_orders").update({ txid }).eq("id", order.id);
      return json({
        ok: true, order_id: order.id, provider, total, unit_price: found.unit,
        pix_copia_cola: payment.qrCode || "",
        qrcode_base64: stripDataPrefix(payment.qrCodeBase64 || ""),
        ticket_url: payment.ticketUrl || null,
      });
    }

    const creds = buildCredentials(efiSettings);
    const cob = await createCharge(creds, { txid, amount: total, description, expiresInSec: 86400 });
    if (cob.status < 200 || cob.status >= 300) {
      await admin.from("credit_orders").update({ status: "failed", delivery_error: "efi_cob_falhou" }).eq("id", order.id);
      return json({ error: "cob_failed", status: cob.status, body: cob.body }, 400);
    }
    const pixCopiaCola: string = cob.body?.pixCopiaECola || "";
    let qrcodeBase64 = "";
    const locId = cob.body?.loc?.id;
    if (locId) {
      const qr = await getQrCode(creds, locId);
      if (qr.status === 200 && qr.body?.imagemQrcode) qrcodeBase64 = stripDataPrefix(qr.body.imagemQrcode);
    }
    await admin.from("efi_charges").insert({
      owner_id: sellerId,
      customer_id: null,
      pending_id: order.id,
      pending_kind: "credit_order",
      txid,
      amount: total,
      environment: creds.env,
      provider: "efi",
      pix_copia_cola: pixCopiaCola,
      qrcode_base64: qrcodeBase64,
      metadata: { description, source: "credit_order", buyer_id: buyerId, buyer_email: buyerEmail, panel_username: panelUsername, buyer_phone: buyerPhone },
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    await admin.from("credit_orders").update({ txid }).eq("id", order.id);
    return json({
      ok: true, order_id: order.id, provider, total, unit_price: found.unit,
      pix_copia_cola: pixCopiaCola, qrcode_base64: qrcodeBase64,
    });
  };

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    // ================= Público (link do revendedor) =================
    if (action.startsWith("public-")) {
      const slug = String(body.slug || "").trim().toLowerCase();
      const seller = slug ? await findSellerBySlug(slug) : null;
      if (!seller || seller.is_active === false) return json({ error: "link_invalido" }, 404);

      if (action === "public-catalog") {
        const { data: tiers } = await admin
          .from("credit_price_tiers").select("*").eq("owner_id", seller.user_id).eq("is_active", true).order("min_qty");
        const ids = [...new Set((tiers || []).map((t: any) => t.server_id))];
        const { data: servers } = ids.length
          ? await admin.from("servers").select("id, server_name").in("id", ids).order("server_name")
          : { data: [] as any[] };
        return json({
          ok: true,
          seller: {
            display_name: seller.display_name,
            logo_url: seller.logo_url,
            brand_color: seller.brand_color,
            headline: seller.headline,
            subheadline: seller.subheadline,
          },
          providers: { efi: seller.enable_efi !== false, mercadopago: seller.enable_mercadopago === true },
          servers: servers || [],
          tiers: tiers || [],
        });
      }

      if (action === "public-identify") {
        const found = await identifyBuyer({
          panelUsername: String(body.panel_username || ""),
          phone: String(body.phone || ""),
          email: String(body.email || ""),
        });
        if (!found) {
          return json({
            ok: true,
            found: false,
            message: "Não encontramos essa conta. Confira o usuário do painel, o telefone ou o e-mail de acesso.",
          });
        }
        return json({ ok: true, found: true, name: found.full_name || found.email, email: found.email });
      }

      if (action === "public-create-order") {
        const email = String(body.email || "").trim().toLowerCase();
        const panelUsername = String(body.panel_username || "").trim();
        const phone = onlyDigits(String(body.phone || ""));
        const serverId = String(body.server_id || "");
        const qty = Math.max(1, Math.round(Number(body.quantity) || 0));
        const provider = String(body.provider || "efi") === "mercadopago" ? "mercadopago" : "efi";
        if (!serverId || !qty) return json({ error: "parametros_invalidos" }, 400);
        if (!panelUsername) {
          return json({ error: "usuario_obrigatorio", message: "Informe o usuário do painel para sabermos onde lançar os créditos." }, 400);
        }
        if (!email && !phone) {
          return json({ error: "contato_obrigatorio", message: "Informe o telefone ou o e-mail de acesso." }, 400);
        }

        const buyer = await identifyBuyer({ panelUsername, phone, email });
        if (!buyer?.user_id) {
          return json({
            error: "conta_nao_encontrada",
            message: "Não encontramos essa conta. Confira o usuário do painel, o telefone ou o e-mail de acesso.",
          }, 400);
        }
        return await buildOrder({
          sellerId: seller.user_id, buyerId: buyer.user_id, buyerEmail: buyer.email || email || null,
          serverId, qty, provider, panelUsername, buyerPhone: phone || null,
        });
      }

      if (action === "public-order-status") {
        const { data } = await admin
          .from("credit_orders").select("id, status, quantity, total, server_name").eq("id", String(body.order_id)).maybeSingle();
        if (!data) return json({ error: "not_found" }, 404);
        return json({ ok: true, order: data });
      }

      return json({ error: "unknown_action" }, 400);
    }

    // ================= Autenticado =================
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const { data: adminRole } = await admin
      .from("user_roles").select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRole;

    if (action === "catalog") {
      // Cada revendedor (inclusive o admin) só precifica os SEUS próprios
      // servidores. Nunca listar servidores de outras revendas aqui.
      const [{ data: myServers }, { data: myTiers }, { data: access }, { data: checkout }] = await Promise.all([
        admin.from("servers").select("id, server_name, host").eq("created_by", userId).order("server_name"),
        admin.from("credit_price_tiers").select("*").eq("owner_id", userId).order("min_qty"),
        admin.from("reseller_access").select("credits").eq("user_id", userId).maybeSingle(),
        admin.from("reseller_checkout_settings").select("slug, is_active").eq("user_id", userId).maybeSingle(),
      ]);
      // Servidores que o revendedor pode precificar: os dele + os já usados na tabela.
      const extraIds = (myTiers || [])
        .map((t: any) => t.server_id)
        .filter((id: string) => !(myServers || []).some((s: any) => s.id === id));
      let extras: any[] = [];
      if (extraIds.length) {
        const { data } = await admin.from("servers").select("id, server_name, host").in("id", extraIds);
        extras = data || [];
      }
      return json({
        ok: true,
        is_admin: isAdmin,
        credits: Number((access as any)?.credits || 0),
        slug: checkout?.slug || null,
        link_active: checkout?.is_active !== false,
        servers: [...(myServers || []), ...extras],
        tiers: myTiers || [],
      });
    }

    // Salva a tabela inteira de um servidor a partir de um único campo de texto.
    if (action === "save-table") {
      const serverId = String(body.server_id || "");
      const rows = Array.isArray(body.tiers) ? body.tiers : parseTierText(String(body.text || ""));
      if (!serverId) return json({ error: "servidor_obrigatorio" }, 400);
      if (!rows.length) {
        return json({ error: "tabela_vazia", message: "Não consegui ler nenhuma faixa. Use, por exemplo: 10 a 19 = 8,00" }, 400);
      }
      await admin.from("credit_price_tiers").delete().eq("owner_id", userId).eq("server_id", serverId);
      const payload = rows.map((r: any) => ({
        owner_id: userId,
        server_id: serverId,
        min_qty: Math.max(1, Math.round(Number(r.min_qty))),
        max_qty: Math.max(1, Math.round(Number(r.max_qty))),
        unit_price: Number(Number(r.unit_price).toFixed(2)),
        is_active: true,
      }));
      const { error } = await admin.from("credit_price_tiers").insert(payload);
      if (error) throw error;
      return json({ ok: true, saved: payload.length, tiers: payload });
    }

    if (action === "preview-table") {
      return json({ ok: true, tiers: parseTierText(String(body.text || "")) });
    }

    if (action === "delete-table") {
      await admin.from("credit_price_tiers").delete().eq("owner_id", userId).eq("server_id", String(body.server_id));
      return json({ ok: true });
    }

    if (action === "my-orders") {
      const { data: sales } = await admin
        .from("credit_orders").select("*").eq("seller_id", userId).order("created_at", { ascending: false }).limit(100);
      const { data: purchases } = await admin
        .from("credit_orders").select("*").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(100);
      return json({ ok: true, sales: sales || [], purchases: purchases || [], orders: purchases || [] });
    }

    if (action === "order-status") {
      const { data } = await admin.from("credit_orders").select("*").eq("id", String(body.order_id)).maybeSingle();
      if (!data || (data.buyer_id !== userId && data.seller_id !== userId && !isAdmin)) return json({ error: "not_found" }, 404);
      return json({ ok: true, order: data });
    }

    // Compra logada (revendedor comprando do seu superior/admin pelo slug informado).
    if (action === "create-order") {
      const slug = String(body.slug || "").trim().toLowerCase();
      const seller = slug ? await findSellerBySlug(slug) : null;
      if (!seller) return json({ error: "link_invalido" }, 404);
      const qty = Math.max(1, Math.round(Number(body.quantity) || 0));
      const provider = String(body.provider || "efi") === "mercadopago" ? "mercadopago" : "efi";
      return await buildOrder({
        sellerId: seller.user_id,
        buyerId: userId,
        buyerEmail: userData.user.email || null,
        serverId: String(body.server_id || ""),
        qty,
        provider,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[credit-store]", msg);
    return json({ error: msg }, 500);
  }
});
