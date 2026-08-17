// Login automático no IBO Sol (ibosol.com) usando o agente SeleniumBase.
// A página de login usa Cloudflare Turnstile — o agente resolve o desafio,
// preenche e-mail/senha, envia o formulário e o token (Laravel Sanctum) fica
// no localStorage do painel. Guardamos o token em activation_panel_credentials
// e as credenciais em `extra` para renovar a sessão automaticamente depois.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGIN_URL = "https://ibosol.com/login";

function extractToken(storage: Record<string, unknown>): string | null {
  const isToken = (v: unknown) =>
    typeof v === "string" && /^\d{3,}\|[A-Za-z0-9]{20,}$/.test(v.trim());

  for (const [k, raw] of Object.entries(storage || {})) {
    if (isToken(raw)) return String(raw).trim();
    if (typeof raw !== "string") continue;
    // Valores em JSON: {"token":"5114508|xxxx"} ou aninhados
    if (!raw.trim().startsWith("{") && !raw.trim().startsWith("[")) continue;
    try {
      const found: string[] = [];
      const walk = (node: unknown) => {
        if (isToken(node)) { found.push(String(node).trim()); return; }
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === "object") Object.values(node as any).forEach(walk);
      };
      walk(JSON.parse(raw));
      if (found.length) return found[0];
    } catch { /* chave não é JSON */ }
    void k;
  }
  return null;
}

export async function ibosolBrowserLogin(email: string, password: string) {
  const base = (Deno.env.get("SIGMA_PROXY_URL") || "").replace(/\/+$/, "");
  const secret = Deno.env.get("SIGMA_PROXY_SECRET") || "";
  if (!base) {
    throw new Error(
      "O agente de navegador (SeleniumBase) não está configurado. Cole o token manualmente ou configure o agente na VPS.",
    );
  }

  const res = await fetch(base + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": secret },
    body: JSON.stringify({
      browser: true,
      url: LOGIN_URL,
      wait_ms: 9000,
      steps: [
        { selector: "#email", value: email },
        { selector: "#password", value: password },
        { selector: "button[type='submit']", click: true, wait_ms: 9000 },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Agente respondeu HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Resposta inválida do agente de navegador."); }

  const token = extractToken(data.storage || {});
  if (token) return { token, final_url: data.final_url, captcha: data.captcha };

  const captcha = data.captcha || {};
  if (captcha.status && !["not_detected", "solve_finished"].includes(captcha.status)) {
    throw new Error(
      `O Cloudflare bloqueou o login automático (${captcha.message || captcha.status}). Tente novamente em alguns minutos ou cole o token manualmente.`,
    );
  }

  const html = String(data.html || "").toLowerCase();
  if (html.includes("invalid credentials") || html.includes("credenciais") || html.includes("unauthorized")) {
    throw new Error("E-mail ou senha do IBO Sol incorretos.");
  }

  throw new Error(
    "O login foi enviado, mas o token não apareceu no painel. Confira e-mail/senha e tente de novo — se persistir, cole o token manualmente.",
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: jh });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Informe e-mail e senha do IBO Sol." }), { status: 400, headers: jh });
    }

    const { token, final_url } = await ibosolBrowserLogin(email, password);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { error } = await admin
      .from("activation_panel_credentials")
      .upsert({
        user_id: auth.user.id,
        panel_type: "ibosol",
        username: "https://backend-apis.ibosol.com",
        password: token,
        is_enabled: body.is_enabled === false ? false : true,
        extra: { email, login_password: password, auto_login: true, last_login_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,panel_type" });
    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ success: true, final_url, token_preview: token.slice(0, 10) + "..." }),
      { headers: jh },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: jh });
  }
});
