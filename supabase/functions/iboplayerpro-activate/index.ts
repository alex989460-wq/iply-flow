// IBO Player Pro (cms.iboplayer.pro) auto-activation.
// API base: https://api.iboproapp.com  (fallback https://api.proapqapi.xyz)
//   POST /admin/devices/info      { mac_address }
//   POST /admin/devices/activate  { mac_address, tier: "YEAR", name, note }
// Reutiliza o accessToken guardado em activation_panel_credentials.extra.access_token
// pelo iboplayerpro-keepalive. Se estiver ausente/expirado, faz login on-demand.
//
// Verifica se o MAC já está ativo com validade futura antes de gastar crédito.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const API_BASES = ["https://api.iboproapp.com", "https://api.proapqapi.xyz"];

const commonHeaders = (token?: string) => {
  const h: Record<string, string> = {
    "User-Agent": UA,
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    Origin: "https://cms.iboplayer.pro",
    Referer: "https://cms.iboplayer.pro/",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

function normalizeMac(mac: string): string {
  const clean = String(mac || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (clean.length !== 12) return String(mac || "").trim().toLowerCase();
  return clean.match(/.{2}/g)!.join(":");
}

async function loginIboPro(email: string, password: string) {
  for (const base of API_BASES) {
    try {
      const r = await fetch(`${base}/admin/login`, {
        method: "POST",
        headers: commonHeaders(),
        body: JSON.stringify({ username: email, password }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.status === true && j?.accessToken) {
        return { ok: true, base, token: j.accessToken as string };
      }
    } catch { /* try next */ }
  }
  return { ok: false, base: null as string | null, token: "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jh = { ...cors, "Content-Type": "application/json" };

  try {
    const internalSecret = req.headers.get("x-cakto-webhook-secret");
    const isInternal =
      !!Deno.env.get("CAKTO_WEBHOOK_SECRET") &&
      internalSecret === Deno.env.get("CAKTO_WEBHOOK_SECRET");

    let callerUserId: string | null = null;
    if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jh });
      }
      const supa = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error } = await supa.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jh });
      }
      callerUserId = user.id;
    }

    const body = await req.json();
    const macRaw = String(body.mac || body.mac_address || "").trim();
    const tier = String(body.tier || "YEAR").toUpperCase();
    const name = String(body.name || body.customer_name || "").trim();
    const note = String(body.note || "").trim();
    const ownerIdFromBody = body.user_id as string | undefined;
    const customerId = body.customer_id as string | undefined;

    if (!macRaw) {
      return new Response(JSON.stringify({ error: "mac é obrigatório" }), { status: 400, headers: jh });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let ownerId = callerUserId || ownerIdFromBody || null;
    if (customerId && !ownerId) {
      const { data: c } = await admin
        .from("customers")
        .select("created_by")
        .eq("id", customerId)
        .maybeSingle();
      ownerId = (c as any)?.created_by || null;
    }
    if (!ownerId) {
      return new Response(JSON.stringify({ error: "Não foi possível resolver o revendedor" }), { status: 400, headers: jh });
    }

    const { data: cred } = await admin
      .from("activation_panel_credentials")
      .select("id, username, password, extra, is_enabled")
      .eq("user_id", ownerId)
      .eq("panel_type", "iboplayerpro")
      .maybeSingle();

    if (!cred || !(cred as any).is_enabled) {
      return new Response(JSON.stringify({ error: "IBO Player Pro não configurado ou desabilitado" }), { status: 400, headers: jh });
    }

    const email = String((cred as any).username || "").trim();
    const password = String((cred as any).password || "").trim();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "E-mail/senha do IBO Player Pro ausentes" }), { status: 400, headers: jh });
    }

    // Tenta reutilizar token do keepalive
    let token = String((cred as any).extra?.access_token || "");
    let base = String((cred as any).extra?.api_base || API_BASES[0]);

    const doAuthed = async (path: string, payload: any) => {
      let r = await fetch(`${base}${path}`, {
        method: "POST",
        headers: commonHeaders(token),
        body: JSON.stringify(payload),
      });
      if (r.status === 401 || r.status === 403) {
        const li = await loginIboPro(email, password);
        if (!li.ok) return { r, j: { status: false, message: "Login IBO Player Pro falhou" } as any };
        token = li.token; base = li.base!;
        await admin.from("activation_panel_credentials").update({
          extra: { access_token: token, api_base: base, refreshed_at: new Date().toISOString() },
        }).eq("id", (cred as any).id);
        r = await fetch(`${base}${path}`, {
          method: "POST",
          headers: commonHeaders(token),
          body: JSON.stringify(payload),
        });
      }
      const j = await r.json().catch(() => ({} as any));
      return { r, j };
    };

    if (!token) {
      const li = await loginIboPro(email, password);
      if (!li.ok) {
        return new Response(JSON.stringify({ error: "Login IBO Player Pro falhou" }), { status: 401, headers: jh });
      }
      token = li.token; base = li.base!;
      await admin.from("activation_panel_credentials").update({
        extra: { access_token: token, api_base: base, refreshed_at: new Date().toISOString() },
      }).eq("id", (cred as any).id);
    }

    const mac = normalizeMac(macRaw);

    // 1) info — evita duplicar crédito se MAC já estiver ativo com validade futura
    const info = await doAuthed("/admin/devices/info", { mac_address: mac });
    const dev = info.j?.device;
    if (dev?.expire_date) {
      const expDate = new Date(String(dev.expire_date).replace(" ", "T") + "Z");
      if (!isNaN(expDate.getTime()) && expDate.getTime() > Date.now()) {
        return new Response(JSON.stringify({
          success: false,
          already_active: true,
          error: `MAC ${mac} já está ativo no IBO Player Pro até ${expDate.toLocaleDateString("pt-BR")}.`,
          expiry: expDate.toISOString(),
          mac,
        }), { status: 409, headers: jh });
      }
    }

    // 2) activate
    const act = await doAuthed("/admin/devices/activate", {
      mac_address: mac, tier, name, note,
    });

    if (act.r.ok && act.j?.status === true) {
      return new Response(JSON.stringify({
        success: true,
        message: act.j?.message || `MAC ${mac} ativado no IBO Player Pro`,
        tier, mac,
      }), { headers: jh });
    }

    return new Response(JSON.stringify({
      success: false,
      error: act.j?.message || `HTTP ${act.r.status} ao ativar no IBO Player Pro`,
      detail: act.j,
    }), { status: 502, headers: jh });
  } catch (err) {
    console.error("[iboplayerpro-activate] erro:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
