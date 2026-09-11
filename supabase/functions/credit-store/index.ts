// Loja de créditos do revendedor.
// - Admin cadastra faixas de preço por servidor (credit_price_tiers).
// - Revendedor escolhe servidor + quantidade, o sistema calcula o valor pela
//   faixa e gera o Pix (Efí ou Mercado Pago) na conta do admin.
// - Quando o Pix é pago, o efi-webhook credita automaticamente (pending_kind
//   = "credit_order").

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

function stripDataPrefix(v: string) {
  return String(v || "").replace(/^data:image\/\w+;base64,/, "");
}

export function priceFor(tiers: any[], qty: number): { unit: number; tier: any } | null {
  const active = (tiers || []).filter((t) => t.is_active !== false);
  const exact = active.find((t) => qty >= Number(t.min_qty) && qty <= Number(t.max_qty));
  if (exact) return { unit: Number(exact.unit_price), tier: exact };
  // Acima da última faixa: usa a faixa de maior max_qty (melhor preço da tabela).
  const sorted = [...active].sort((a, b) => Number(b.max_qty) - Number(a.max_qty));
  if (sorted.length && qty > Number(sorted[0].max_qty)) {
    return { unit: Number(sorted[0].unit_price), tier: sorted[0] };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: adminRole } = await admin
      .from("user_roles").select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRole;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    // ---------------- Catálogo ----------------
    if (action === "catalog") {
      const [{ data: servers }, { data: tiers }, { data: access }] = await Promise.all([
        admin.from("servers").select("id, server_name, host, status").order("server_name"),
        admin.from("credit_price_tiers").select("*").order("min_qty"),
        admin.from("reseller_access").select("credits").eq("user_id", userId).maybeSingle(),
      ]);
      const visible = (tiers || []).filter((t: any) => isAdmin || t.is_active !== false);
      const serverIds = new Set(visible.map((t: any) => t.server_id));
      return json({
        ok: true,
        is_admin: isAdmin,
        credits: Number((access as any)?.credits || 0),
        servers: (servers || []).filter((s: any) => isAdmin || serverIds.has(s.id)),
        all_servers: isAdmin ? servers || [] : [],
        tiers: visible,
      });
    }

    if (action === "quote") {
      const serverId = String(body.server_id || "");
      const qty = Math.max(1, Math.round(Number(body.quantity) || 0));
      if (!serverId || !qty) return json({ error: "parametros_invalidos" }, 400);
      const { data: tiers } = await admin
        .from("credit_price_tiers").select("*").eq("server_id", serverId).eq("is_active", true);
      const found = priceFor(tiers || [], qty);
      if (!found) return json({ ok: false, error: "sem_faixa", message: "Nenhuma faixa de preço cobre essa quantidade." });
      return json({ ok: true, unit_price: found.unit, total: Number((found.unit * qty).toFixed(2)), quantity: qty });
    }

    // ---------------- Admin: faixas ----------------
    if (action === "save-tier" || action === "delete-tier") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      if (action === "delete-tier") {
        await admin.from("credit_price_tiers").delete().eq("id", String(body.id));
        return json({ ok: true });
      }
      const payload = {
        server_id: String(body.server_id),
        min_qty: Math.max(1, Math.round(Number(body.min_qty) || 1)),
        max_qty: Math.max(1, Math.round(Number(body.max_qty) || 1)),
        unit_price: Number(body.unit_price),
        is_active: body.is_active !== false,
        updated_at: new Date().toISOString(),
      };
      if (!payload.server_id || !isFinite(payload.unit_price) || payload.unit_price <= 0) {
        return json({ error: "parametros_invalidos" }, 400);
      }
      if (payload.max_qty < payload.min_qty) return json({ error: "faixa_invalida" }, 400);
      if (body.id) {
        await admin.from("credit_price_tiers").update(payload).eq("id", String(body.id));
      } else {
        await admin.from("credit_price_tiers").insert(payload);
      }
      return json({ ok: true });
    }

    // ---------------- Pedidos ----------------
    if (action === "my-orders") {
      const q = admin
        .from("credit_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      const { data } = isAdmin && body.all === true ? await q : await q.eq("buyer_id", userId);
      return json({ ok: true, orders: data || [] });
    }

    if (action === "order-status") {
      const { data } = await admin
        .from("credit_orders").select("*").eq("id", String(body.order_id)).maybeSingle();
      if (!data || (data.buyer_id !== userId && !isAdmin)) return json({ error: "not_found" }, 404);
      return json({ ok: true, order: data });
    }

    if (action === "create-order") {
      const serverId = String(body.server_id || "");
      const qty = Math.max(1, Math.round(Number(body.quantity) || 0));
      const provider = String(body.provider || "efi") === "mercadopago" ? "mercadopago" : "efi";
      if (!serverId || !qty) return json({ error: "parametros_invalidos" }, 400);

      const [{ data: server }, { data: tiers }] = await Promise.all([
        admin.from("servers").select("id, server_name").eq("id", serverId).maybeSingle(),
        admin.from("credit_price_tiers").select("*").eq("server_id", serverId).eq("is_active", true),
      ]);
      if (!server) return json({ error: "servidor_invalido" }, 400);
      const found = priceFor(tiers || [], qty);
      if (!found) return json({ error: "sem_faixa", message: "Nenhuma faixa de preço cobre essa quantidade." }, 400);

      const total = Number((found.unit * qty).toFixed(2));

      // Vendedor = admin da plataforma (dono das credenciais de recebimento).
      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = (admins || []).map((a: any) => a.user_id);
      if (!adminIds.length) return json({ error: "sem_admin" }, 400);

      let sellerId = "";
      let efiSettings: any = null;
      let mpSettings: any = null;

      if (provider === "efi") {
        const { data } = await admin
          .from("efi_settings").select("*").in("user_id", adminIds).eq("enabled", true).limit(1);
        efiSettings = data?.[0] || null;
        if (!efiSettings) return json({ error: "efi_nao_configurado", message: "Pix Efí não está configurado no painel administrativo." }, 400);
        sellerId = efiSettings.user_id;
      } else {
        const { data } = await admin
          .from("mercadopago_settings").select("*").in("user_id", adminIds).eq("enabled", true).limit(1);
        mpSettings = data?.[0] || null;
        if (!mpSettings?.access_token) return json({ error: "mp_nao_configurado", message: "Mercado Pago não está configurado no painel administrativo." }, 400);
        sellerId = mpSettings.user_id;
      }

      const { data: order, error: orderErr } = await admin
        .from("credit_orders")
        .insert({
          buyer_id: userId,
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
          payerEmail: userData.user.email || undefined,
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
          metadata: { description, source: "credit_order", buyer_id: userId },
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
        });
        await admin.from("credit_orders").update({ txid }).eq("id", order.id);
        return json({
          ok: true,
          order_id: order.id,
          provider,
          total,
          unit_price: found.unit,
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
        metadata: { description, source: "credit_order", buyer_id: userId },
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      });
      await admin.from("credit_orders").update({ txid }).eq("id", order.id);

      return json({
        ok: true,
        order_id: order.id,
        provider,
        total,
        unit_price: found.unit,
        pix_copia_cola: pixCopiaCola,
        qrcode_base64: qrcodeBase64,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[credit-store]", msg);
    return json({ error: msg }, 500);
  }
});
