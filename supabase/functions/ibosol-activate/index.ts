// IBO Sol (ibosol.com) auto-activation via Bearer token.
// User logs in manually at https://ibosol.com/login (Cloudflare Turnstile),
// then copies the "token" returned by POST /api/login and saves it here.
// Token format: "5114508|tb3dyiNd..." (Laravel Sanctum).
//
// Endpoints (from HAR):
//   POST https://backend-apis.ibosol.com/api/check-device-status
//        body: {"macAddress":"aa:bb:...", "app_id":3}
//   POST https://backend-apis.ibosol.com/api/get-multi-app-activate
//        body: {"module":{"selectedModule":"BOBPLAYER"},
//               "requestData":{"is_trial":3,"macAddress":"...","appType":"single-app",
//                              "email":"","creditPoints":1,"isConfirmed":true,"app_id":3}}
//
// App IDs (subset — matches app_name in activation_requests):
//   BOBPLAYER=3, IBOPLAYER=1, BOBPRO=15, BOBPREMIUM=16, IBOSTB=12,
//   IBOSSPLAYER=10, IBOSOLPlayer=17, "IBO VPN Player"=20, "IBO Play"=22

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret",
};

const API_BASE = "https://backend-apis.ibosol.com/api";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

// Map the app_name coming from Cakto/activation_requests to IBO Sol app_id + selectedModule.
const APP_MAP: Record<string, { id: number; module: string }> = {
  BOBPLAYER: { id: 3, module: "BOBPLAYER" },
  "BOB PLAYER": { id: 3, module: "BOBPLAYER" },
  BOBPRO: { id: 15, module: "BOBPRO" },
  BOBPREMIUM: { id: 16, module: "BOBPREMIUM" },
  IBOPLAYER: { id: 1, module: "IBOPLAYER" },
  "IBO PLAYER": { id: 1, module: "IBOPLAYER" },
  IBOSTB: { id: 12, module: "IBOSTB" },
  IBOSSPLAYER: { id: 10, module: "IBOSSPLAYER" },
  IBOSOLPLAYER: { id: 17, module: "IBOSOLPlayer" },
  "IBO VPN PLAYER": { id: 20, module: "IBO VPN Player" },
  "IBO PLAY": { id: 22, module: "IBO Play" },
  ABEPLAYERTV: { id: 2, module: "ABEPlayerTV" },
  MACPLAYER: { id: 4, module: "MACPLAYER" },
  VIRGINIA: { id: 5, module: "VIRGINIA" },
  ALLPLAYER: { id: 6, module: "AllPlayer" },
  HUSHPLAY: { id: 7, module: "HUSHPLAY" },
  KTNPLAYER: { id: 8, module: "KTNPLAYER" },
  FAMILYPLAYER: { id: 9, module: "FAMILYPLAYER" },
  KING4KPLAYER: { id: 11, module: "KING4KPLAYER" },
  IBOXXPLAYER: { id: 13, module: "IBOXXPLAYER" },
  DUPLEX: { id: 14, module: "DUPLEX" },
  FLIXNET: { id: 18, module: "FLIXNET" },
  SMARTONEPRO: { id: 19, module: "SMARTONEPRO" },
  "CR PLAYER": { id: 21, module: "CR Player" },
  "HQ PLAYER": { id: 24, module: "HQ Player" },
  MESSITV: { id: 25, module: "MessiTV" },
};

function resolveApp(name: string): { id: number; module: string } | null {
  const key = String(name || "").trim().toUpperCase();
  if (APP_MAP[key]) return APP_MAP[key];
  // fuzzy: strip spaces
  const compact = key.replace(/\s+/g, "");
  if (APP_MAP[compact]) return APP_MAP[compact];
  return null;
}

function normalizeMac(mac: string): string {
  const clean = String(mac || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (clean.length !== 12) return String(mac || "").trim().toLowerCase();
  return clean.match(/.{2}/g)!.join(":");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

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
    const macRaw = String(body.mac || body.macAddress || "").trim();
    const appName = String(body.app_name || body.app || "").trim();
    const email = String(body.email || "").trim();
    const isTrial = Number(body.is_trial ?? 3); // 3 = 12 months (from HAR)
    const creditPoints = Number(body.credit_points ?? 1);
    const ownerIdFromBody = body.user_id as string | undefined;
    const customerId = body.customer_id as string | undefined;

    if (!macRaw || !appName) {
      return new Response(
        JSON.stringify({ error: "mac e app_name são obrigatórios" }),
        { status: 400, headers: jh },
      );
    }
    const app = resolveApp(appName);
    if (!app) {
      return new Response(
        JSON.stringify({ error: `App "${appName}" não mapeado para o IBO Sol` }),
        { status: 400, headers: jh },
      );
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
      return new Response(
        JSON.stringify({ error: "Não foi possível resolver o revendedor" }),
        { status: 400, headers: jh },
      );
    }

    const { data: cred } = await admin
      .from("activation_panel_credentials")
      .select("username, password, is_enabled")
      .eq("user_id", ownerId)
      .eq("panel_type", "ibosol")
      .maybeSingle();

    if (!cred || !(cred as any).is_enabled) {
      return new Response(
        JSON.stringify({ error: "IBO Sol não configurado ou desabilitado" }),
        { status: 400, headers: jh },
      );
    }

    const token = String((cred as any).password || "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token do IBO Sol vazio nas configurações" }),
        { status: 400, headers: jh },
      );
    }

    const mac = normalizeMac(macRaw);
    const baseHeaders: Record<string, string> = {
      "User-Agent": UA,
      "Content-Type": "application/json-patch+json",
      Accept: "application/json",
      Origin: "https://ibosol.com",
      Referer: "https://ibosol.com/check-mac",
      Authorization: `Bearer ${token}`,
    };

    // 1) check-device-status (não bloqueia se ativo — é só telemetria)
    let currentStatus: string | null = null;
    try {
      const chk = await fetch(`${API_BASE}/check-device-status`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify({ macAddress: mac, app_id: app.id }),
      });
      const cj = await chk.json().catch(() => ({}));
      currentStatus = cj?.status ?? null;
      if (chk.status === 401 || chk.status === 403) {
        return new Response(
          JSON.stringify({
            error: "Token IBO Sol expirado. Faça login em ibosol.com e cole o novo token nas configurações.",
          }),
          { status: 401, headers: jh },
        );
      }
    } catch (_) { /* ignora — o passo 2 é o que importa */ }

    // 2) get-multi-app-activate
    const activatePayload = {
      module: { selectedModule: app.module },
      requestData: {
        is_trial: isTrial,
        macAddress: mac,
        appType: "single-app",
        email,
        creditPoints,
        isConfirmed: true,
        app_id: app.id,
      },
    };

    const act = await fetch(`${API_BASE}/get-multi-app-activate`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(activatePayload),
    });
    const aj = await act.json().catch(() => ({} as any));

    if (act.status === 401 || act.status === 403) {
      return new Response(
        JSON.stringify({
          error: "Token IBO Sol expirado. Faça login em ibosol.com e cole o novo token nas configurações.",
        }),
        { status: 401, headers: jh },
      );
    }

    if (act.ok && aj?.status === true) {
      return new Response(
        JSON.stringify({
          success: true,
          message: aj?.msg || `MAC ${mac} ativado no ${app.module}`,
          previous_status: currentStatus,
          module: app.module,
          app_id: app.id,
          mac,
        }),
        { headers: jh },
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: aj?.msg || aj?.message || `HTTP ${act.status} ao ativar no IBO Sol`,
        detail: aj,
      }),
      { status: 502, headers: jh },
    );
  } catch (err) {
    console.error("[ibosol-activate] erro:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
