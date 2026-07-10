import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret",
};

const DEFAULT_BASE_URL = "https://gesapioffice.com";
const PANEL_HOST = "searchdefense.top";

class UniplayExternalError extends Error {
  status?: number;
  endpoint?: string;
  body?: string;

  constructor(message: string, details?: { status?: number; endpoint?: string; body?: string }) {
    super(message);
    this.name = "UniplayExternalError";
    this.status = details?.status;
    this.endpoint = details?.endpoint;
    this.body = details?.body;
  }
}

function normalizeApiBaseUrl(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value) return DEFAULT_BASE_URL;

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();

    // searchdefense.top is only the browser panel. Its own JS calls gesapioffice.com for the API.
    if (host === PANEL_HOST) return DEFAULT_BASE_URL;

    const path = url.pathname.replace(/\/+$/, "");
    const cleanPath = path === "/api" ? "" : path;
    return `${url.protocol}//${url.host}${cleanPath}`.replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function previewBody(body: string): string {
  const text = body.trim();
  if (!text) return "resposta vazia";
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    return "retornou HTML em vez de JSON";
  }
  return text.slice(0, 500);
}

async function parseJsonResponse<T>(res: Response, endpoint: string, label: string): Promise<T> {
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    throw new UniplayExternalError(
      `${label} falhou: ${res.status} - ${previewBody(text)}. Endpoint testado: ${endpoint}`,
      { status: res.status, endpoint, body: text },
    );
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new UniplayExternalError(
      `${label} retornou resposta inválida (${contentType || "sem content-type"}) - ${previewBody(text)}. Endpoint testado: ${endpoint}`,
      { status: res.status, endpoint, body: text },
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UniplayExternalError(
      `${label} retornou JSON inválido - ${previewBody(text)}. Endpoint testado: ${endpoint}`,
      { status: res.status, endpoint, body: text },
    );
  }
}

function uniplayHeaders(extra?: HeadersInit): HeadersInit {
  return {
    Accept: "application/json, text/plain, */*",
    Origin: "https://searchdefense.top",
    Referer: "https://searchdefense.top/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    ...extra,
  };
}

// Build phone/username variants (55 country code, 9th digit) like rush-renew does.
function buildUsernameVariants(raw: string): string[] {
  const base = String(raw || "").trim();
  const set = new Set<string>();
  if (!base) return [];
  set.add(base);
  const digits = base.replace(/\D/g, "");
  if (digits) {
    set.add(digits);
    if (digits.startsWith("55") && digits.length >= 12) {
      const wo = digits.slice(2);
      set.add(wo);
      if (wo.length === 11 && wo[2] === "9") {
        set.add(wo.slice(0, 2) + wo.slice(3));
        set.add("55" + wo.slice(0, 2) + wo.slice(3));
      } else if (wo.length === 10) {
        set.add(wo.slice(0, 2) + "9" + wo.slice(2));
        set.add("55" + wo.slice(0, 2) + "9" + wo.slice(2));
      }
    } else if (digits.length >= 10) {
      set.add("55" + digits);
    }
  }
  return [...set].filter(Boolean);
}

interface LoginResp {
  access_token: string;
  crypt_pass: string;
  id: number;
  username: string;
}

async function login(baseUrl: string, username: string, password: string): Promise<LoginResp> {
  const endpoint = `${baseUrl}/api/login`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: uniplayHeaders({ "Content-Type": "application/json;charset=UTF-8" }),
    body: JSON.stringify({ username, password, code: "" }),
  });
  return await parseJsonResponse<LoginResp>(res, endpoint, "Login Uniplay");
}

async function loginWithFallback(
  preferredBaseUrl: string,
  username: string,
  password: string,
): Promise<{ session: LoginResp; apiBaseUrl: string }> {
  const candidates = [...new Set([preferredBaseUrl, DEFAULT_BASE_URL].map(normalizeApiBaseUrl))];
  const errors: string[] = [];

  for (const apiBaseUrl of candidates) {
    try {
      return { session: await login(apiBaseUrl, username, password), apiBaseUrl };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
    }
  }

  throw new UniplayExternalError(
    `Não foi possível conectar na API Uniplay. ${errors.join(" | ")}`,
  );
}

async function listIptv(baseUrl: string, token: string, cryptPass: string): Promise<any[]> {
  const url = `${baseUrl}/api/users-iptv?reg_password=${encodeURIComponent(cryptPass)}`;
  const res = await fetch(url, {
    headers: uniplayHeaders({ Authorization: `Bearer ${token}` }),
  });
  return await parseJsonResponse<any[]>(res, url, "Listagem IPTV Uniplay");
}

async function listP2p(baseUrl: string, token: string): Promise<any[]> {
  const endpoint = `${baseUrl}/api/users-p2p`;
  const res = await fetch(endpoint, {
    headers: uniplayHeaders({ Authorization: `Bearer ${token}` }),
  });
  return await parseJsonResponse<any[]>(res, endpoint, "Listagem P2P Uniplay");
}

async function extend(
  baseUrl: string,
  token: string,
  kind: "iptv" | "p2p",
  id: number | string,
  credits: number,
): Promise<{ ok: boolean; body: string; status: number }> {
  const res = await fetch(`${baseUrl}/api/users-${kind}/${id}`, {
    method: "PUT",
    headers: uniplayHeaders({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json;charset=UTF-8",
    }),
    body: JSON.stringify({ action: 1, credits }),
  });
  const body = await res.text();
  return { ok: res.ok, body, status: res.status };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const internalSecret = req.headers.get("x-cakto-webhook-secret");
    const configuredWebhookSecret = Deno.env.get("CAKTO_WEBHOOK_SECRET");
    const isInternalWebhookCall =
      !!configuredWebhookSecret && internalSecret === configuredWebhookSecret;

    let callerUserId: string | null = null;
    if (!isInternalWebhookCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error } = await sb.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      callerUserId = user.id;
    }

    const body = await req.json();
    const {
      username,
      months,
      customer_id,
      uniplay_username,
      uniplay_password,
      uniplay_base_url,
      action,
    } = body ?? {};

    // Load credentials from reseller_api_settings if not provided
    let uUser = uniplay_username || "";
    let uPass = uniplay_password || "";
    let uBase = normalizeApiBaseUrl(uniplay_base_url);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    if (!uUser && (customer_id || callerUserId)) {
      let ownerId = callerUserId;
      if (customer_id) {
        const { data: c } = await admin
          .from("customers")
          .select("created_by")
          .eq("id", customer_id)
          .maybeSingle();
        ownerId = c?.created_by || ownerId;
      }
      if (ownerId) {
        const { data: s } = await admin
          .from("reseller_api_settings")
          .select("uniplay_username, uniplay_password, uniplay_base_url")
          .eq("user_id", ownerId)
          .maybeSingle();
        if (s?.uniplay_username && s?.uniplay_password) {
          uUser = s.uniplay_username;
          uPass = s.uniplay_password;
          uBase = normalizeApiBaseUrl(s.uniplay_base_url);
        }
      }
    }

    if (!uUser || !uPass) {
      return new Response(
        JSON.stringify({
          error:
            "Credenciais do Uniplay não configuradas. Configure usuário e senha em API Externa.",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    console.log(`[Uniplay] Login as ${uUser} @ ${uBase}`);
    const { session, apiBaseUrl } = await loginWithFallback(uBase, uUser, uPass);
    uBase = apiBaseUrl;

    if (action === "test") {
      return new Response(
        JSON.stringify({
          success: true,
          id: session.id,
          username: session.username,
          apiBaseUrl: uBase,
          message: "Login Uniplay OK",
        }),
        { headers: jsonHeaders },
      );
    }

    if (!username) {
      return new Response(JSON.stringify({ error: "Username é obrigatório" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const credits = Math.max(1, Number(months) || 1);
    const candidates = buildUsernameVariants(username);
    const norms = candidates.map((c) => c.toLowerCase().trim());
    console.log(`[Uniplay] Procurando "${username}" (variantes: ${candidates.join(", ")})`);

    // Fetch both lists in parallel
    const [iptvResult, p2pResult] = await Promise.allSettled([
      listIptv(uBase, session.access_token, session.crypt_pass),
      listP2p(uBase, session.access_token),
    ]);

    const listErrors: string[] = [];
    const iptvList = iptvResult.status === "fulfilled" ? iptvResult.value : [];
    const p2pList = p2pResult.status === "fulfilled" ? p2pResult.value : [];
    if (iptvResult.status === "rejected") {
      const msg = iptvResult.reason instanceof Error ? iptvResult.reason.message : String(iptvResult.reason);
      console.error("[Uniplay] iptv list err", msg);
      listErrors.push(msg);
    }
    if (p2pResult.status === "rejected") {
      const msg = p2pResult.reason instanceof Error ? p2pResult.reason.message : String(p2pResult.reason);
      console.error("[Uniplay] p2p list err", msg);
      listErrors.push(msg);
    }

    if (listErrors.length === 2) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Login Uniplay OK, mas não foi possível listar IPTV/P2P: ${listErrors.join(" | ")}`,
        }),
        { headers: jsonHeaders },
      );
    }

    const matchIptv = iptvList.find((u: any) => {
      const un = String(u?.username || "").toLowerCase().trim();
      return norms.includes(un);
    });
    const matchP2p = p2pList.find((u: any) => {
      const un = String(u?.name || "").toLowerCase().trim();
      return norms.includes(un);
    });

    if (!matchIptv && !matchP2p) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Username "${username}" não encontrado em IPTV nem P2P`,
          tried: candidates,
          list_errors: listErrors,
        }),
        { headers: jsonHeaders },
      );
    }

    const results: Array<{ kind: string; ok: boolean; body: string; status: number }> = [];
    if (matchIptv) {
      console.log(`[Uniplay] Renovando IPTV id=${matchIptv.id} credits=${credits}`);
      const r = await extend(uBase, session.access_token, "iptv", matchIptv.id, credits);
      results.push({ kind: "iptv", ...r });
    }
    if (matchP2p) {
      console.log(`[Uniplay] Renovando P2P id=${matchP2p.id} credits=${credits}`);
      const r = await extend(uBase, session.access_token, "p2p", matchP2p.id, credits);
      results.push({ kind: "p2p", ...r });
    }

    const anyOk = results.some((r) => r.ok);
    if (!anyOk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Todas as renovações Uniplay falharam",
          results,
        }),
        { headers: jsonHeaders },
      );
    }

    // Credit deduction (once, based on credits used) — mirror rush-renew behavior
    if (customer_id) {
      const { data: c } = await admin
        .from("customers")
        .select("created_by")
        .eq("id", customer_id)
        .maybeSingle();
      if (c?.created_by) {
        const { data: acc } = await admin
          .from("reseller_access")
          .select("id, credits")
          .eq("user_id", c.created_by)
          .maybeSingle();
        if (acc && (acc.credits ?? 0) >= credits) {
          await admin
            .from("reseller_access")
            .update({ credits: acc.credits - credits })
            .eq("id", acc.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Renovado no Uniplay (${results
          .filter((r) => r.ok)
          .map((r) => r.kind.toUpperCase())
          .join(" + ")}) por ${credits} mês(es)`,
        renewed_in: results.filter((r) => r.ok).map((r) => r.kind),
        results,
      }),
      { headers: jsonHeaders },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[Uniplay] Erro:", err);
    return new Response(JSON.stringify({ success: false, error: `Erro Uniplay: ${msg}` }), {
      headers: jsonHeaders,
    });
  }
});
