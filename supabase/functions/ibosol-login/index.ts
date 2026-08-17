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

  // O agente abre a página de login (o Cloudflare/Turnstile gera o captcha_token
  // dentro dela) e, de dentro do navegador, chama a API de login com esse token.
  const js = `
    const done = arguments[arguments.length - 1];
    (async () => {
      const t0 = Date.now();
      const read = () => {
        const el = document.querySelector('[name="cf-turnstile-response"], #captcha_token');
        return el && el.value ? el.value : "";
      };
      let tok = "";
      while (!tok && Date.now() - t0 < 90000) {
        tok = read();
        if (!tok) await new Promise((r) => setTimeout(r, 1000));
      }
      if (!tok) return done({ error: "turnstile_vazio" });
      try {
        const r = await fetch("https://backend-apis.ibosol.com/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            email: ${JSON.stringify(email)},
            password: ${JSON.stringify(password)},
            captcha_token: tok,
          }),
        });
        const body = await r.text();
        done({ status: r.status, body: body.slice(0, 4000) });
      } catch (e) {
        done({ error: String(e) });
      }
    })();
  `;

  const res = await fetch(base + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": secret },
    body: JSON.stringify({ browser: true, url: LOGIN_URL, wait_ms: 3000, js }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Agente respondeu HTTP ${res.status}: ${text.slice(0, 200)}`);

  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Resposta inválida do agente de navegador."); }

  const r = data.js_result;
  if (!r) {
    throw new Error(
      "O agente da VPS está desatualizado (sem suporte a JS). Atualize o script seleniumbase_agent.py para a versão 1.3.0.",
    );
  }
  if (r.error === "turnstile_vazio") {
    throw new Error("O Cloudflare não liberou o captcha do IBO Sol. Tente novamente em alguns minutos.");
  }
  if (r.error) throw new Error(`Falha no login automático: ${r.error}`);

  let payload: any = {};
  try { payload = JSON.parse(r.body || "{}"); } catch { /* resposta não-JSON */ }

  const token: string | undefined =
    payload?.data?.token || payload?.token || payload?.data?.access_token;
  if (token) return { token: String(token), final_url: data.final_url, captcha: data.captcha };

  const msg = payload?.msg || payload?.message ||
    (r.status === 401 || r.status === 422 ? "E-mail ou senha do IBO Sol incorretos." : "");
  throw new Error(
    msg || `O IBO Sol respondeu HTTP ${r.status} sem token. Cole o token manualmente se persistir.`,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isService = authHeader.replace(/^Bearer\s+/i, "").trim() === serviceKey;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    let userId: string | null = null;

    if (isService) {
      userId = String(body.user_id || "") || null;
    } else {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
      );
      const { data: auth } = await supabase.auth.getUser();
      userId = auth?.user?.id || null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: jh });
    }

    let email = String(body.email || "").trim();
    let password = String(body.password || "");

    if (!email || !password) {
      const { data: saved } = await admin
        .from("activation_panel_credentials")
        .select("extra")
        .eq("user_id", userId)
        .eq("panel_type", "ibosol")
        .maybeSingle();
      email = email || String((saved?.extra as any)?.email || "").trim();
      password = password || String((saved?.extra as any)?.login_password || "");
    }

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
