// Duplecast auto-activation via reseller client area (Blesta panel)
//
// O Duplecast fica atrás do Cloudflare com desafio de navegador ("Just a moment"),
// e o próprio Cloudflare bloqueia chamadas fetch feitas de dentro da página.
// Por isso todo o fluxo usa NAVEGAÇÃO REAL no agente SeleniumBase que roda no PC
// residencial: abre o login, envia o formulário, visita as páginas de códigos e
// submete a ativação por formulário HTML (com o token CSRF lido da própria página).
//
// Modo de teste: enviar { test: true } faz apenas login + listagem de códigos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://duplecast.com";

// Prioriza o agente caseiro (PC residencial) — o Cloudflare do Duplecast bloqueia datacenter.
const HOME_URL = String(Deno.env.get("HOME_AGENT_URL") || "").trim().replace(/\/+$/, "");
const HOME_SECRET = String(Deno.env.get("HOME_AGENT_SECRET") || "").trim();
const PROXY_URL = HOME_URL || String(Deno.env.get("SIGMA_PROXY_URL") || "").trim().replace(/\/+$/, "");
const PROXY_SECRET = HOME_URL
  ? HOME_SECRET
  : String(Deno.env.get("SIGMA_PROXY_SECRET") || "").trim();

const CODE_LIST_URLS = [
  `${BASE}/client/plugin/duplecast/client_codes/index/unused/`,
  `${BASE}/plugin/duplecast/client_codes/index/unused/`,
  `${BASE}/client/plugin/duplecast/client_codes/`,
  `${BASE}/plugin/duplecast/client_codes/`,
];

function loginSteps(email: string, password: string) {
  return [
    { selector: 'input[name="username"]', value: email },
    { selector: 'input[name="password"]', value: password },
    { selector: 'button[type="submit"], input[type="submit"]', click: true, wait_ms: 9000 },
  ];
}

// deno-lint-ignore no-explicit-any
async function callAgent(payload: Record<string, unknown>): Promise<any> {
  const agentUrl = PROXY_URL.startsWith("http") ? PROXY_URL : `https://${PROXY_URL}`;
  const res = await fetch(agentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": PROXY_SECRET },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("Chave do agente incorreta.");
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`O agente respondeu HTTP ${res.status} sem conteúdo válido.`);
  if (data.error) throw new Error(`Agente: ${data.message || data.error}`);
  return data;
}

function extractCodes(html: string): string[] {
  const out: string[] = [];
  const re = /client_codes\/activate\/(\d+)\/?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function isLoggedIn(html: string) {
  return !/name=["']password["']/i.test(html);
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const { email, password, code, mac, test, probe } = await request.json();
    const isTest = !!test;

    if (probe) {
      if (!PROXY_URL) {
        return new Response(JSON.stringify({ ok: false, error: "agente_nao_configurado" }), { headers: jsonHeaders });
      }
      const url = (PROXY_URL.startsWith("http") ? PROXY_URL : `https://${PROXY_URL}`).replace(/\/$/, "");
      try {
        const r = await fetch(`${url}/probe`, { signal: AbortSignal.timeout(20000) });
        const t = (await r.text()).slice(0, 500);
        return new Response(JSON.stringify({ ok: r.ok, status: r.status, body: t }), { headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { headers: jsonHeaders });
      }
    }

    if (!email || !password || (!isTest && !mac)) {
      return new Response(JSON.stringify({ error: "email, password e mac são obrigatórios" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (!PROXY_URL || !PROXY_SECRET) {
      return new Response(
        JSON.stringify({
          error:
            "O Duplecast exige navegador real (Cloudflare). Configure o agente SeleniumBase (HOME_AGENT_URL/HOME_AGENT_SECRET).",
        }),
        { status: 503, headers: jsonHeaders },
      );
    }

    let chosen = String(code || "").replace(/\D/g, "");
    let codes: string[] = [];

    if (isTest || !chosen) {
      const listed = await callAgent({
        browser: true,
        url: `${BASE}/client/login`,
        wait_ms: 6000,
        steps: loginSteps(String(email), String(password)),
        visit: CODE_LIST_URLS,
      });

      const visits = (listed.visits || []) as Array<{ url?: string; html?: string; error?: string }>;
      const loginOk = visits.some((v) => v.html && isLoggedIn(v.html));
      if (!loginOk) {
        return new Response(
          JSON.stringify({ error: "Login no Duplecast não foi concluído (usuário ou senha incorretos).", captcha: listed.captcha?.status }),
          { status: 401, headers: jsonHeaders },
        );
      }

      for (const v of visits) {
        for (const c of extractCodes(v.html || "")) if (!codes.includes(c)) codes.push(c);
      }

      if (isTest) {
        return new Response(
          JSON.stringify({
            success: true,
            codes_disponiveis: codes.length,
            exemplos: codes.slice(0, 20),
            paginas: visits.map((v) => ({ url: v.url, erro: v.error })),
            captcha: listed.captcha?.status,
          }),
          { headers: jsonHeaders },
        );
      }

      chosen = codes[0] || "";
      if (!chosen) {
        return new Response(JSON.stringify({ error: "Nenhum código Duplecast disponível na conta." }), {
          status: 502,
          headers: jsonHeaders,
        });
      }
    }

    const macUp = String(mac).toUpperCase().trim();
    const activateUrl = `${BASE}/plugin/duplecast/client_codes/activate/${chosen}/`;

    const done = await callAgent({
      browser: true,
      url: `${BASE}/client/login`,
      wait_ms: 6000,
      steps: loginSteps(String(email), String(password)),
      submit: { url: activateUrl, fields: { mac: macUp, code: chosen }, csrf_from_page: true },
    });

    const submitted = done.submitted as { url?: string; html?: string; error?: string } | null;
    if (!submitted || submitted.error) {
      return new Response(
        JSON.stringify({ error: `Não foi possível concluir a ativação: ${submitted?.error || "sem resposta"}` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const html = submitted.html || "";
    const err = html.match(/class=["'][^"']*(?:alert-error|alert-danger|error)[^"']*["'][^>]*>([\s\S]{0,300}?)</i);
    if (err && err[1].replace(/<[^>]+>/g, "").trim()) {
      return new Response(
        JSON.stringify({ error: err[1].replace(/<[^>]+>/g, "").trim(), code: chosen, mac: macUp }),
        { status: 502, headers: jsonHeaders },
      );
    }

    return new Response(JSON.stringify({ success: true, code: chosen, mac: macUp, url: submitted.url }), {
      headers: jsonHeaders,
    });
  } catch (err) {
    console.error("[duplecast-activate] erro:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
