// Duplecast auto-activation via reseller client area (Blesta panel)
//
// O Duplecast fica atrás do Cloudflare com desafio de navegador ("Just a moment"),
// então NÃO é possível usar fetch/HTTP puro nem proxy residencial simples: o
// desafio só é resolvido por um navegador real. Por isso todo o fluxo roda numa
// ÚNICA sessão do agente SeleniumBase (browser_session), que:
//   1) abre /client/login e resolve o Cloudflare
//   2) preenche usuário/senha e envia o formulário
//   3) executa, dentro da própria página logada, o JS que lista os códigos
//      disponíveis, pega o CSRF da tela de ativação e envia o MAC.
//
// Modo de teste: enviar { test: true } faz apenas login + listagem de códigos,
// sem consumir nenhum código.

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

function buildScript(opts: { code: string; mac: string; test: boolean }) {
  const cfg = JSON.stringify(opts);
  return `
const done = arguments[arguments.length - 1];
const CFG = ${cfg};
const BASE = ${JSON.stringify(BASE)};
const log = [];
const get = async (u) => {
  const r = await fetch(u, { credentials: 'include' });
  const t = await r.text();
  log.push(u + ' -> ' + r.status);
  return { status: r.status, text: t };
};
const csrf = (html) => {
  const m = html.match(/name=["']_csrf_token["']\\s+value=["']([a-f0-9]+)["']/i)
    || html.match(/value=["']([a-f0-9]+)["']\\s+name=["']_csrf_token["']/i);
  return m ? m[1] : null;
};
(async () => {
  try {
    const home = await get(BASE + '/plugin/duplecast/device_main/');
    const loggedIn = !/name=["']password["']/i.test(home.text) && home.status === 200;
    if (!loggedIn) { done({ ok: false, stage: 'login', message: 'Login não concluído', log }); return; }

    let code = String(CFG.code || '').replace(/\\D/g, '');
    const codes = [];
    const urls = [
      BASE + '/client/plugin/duplecast/client_codes/index/unused/',
      BASE + '/plugin/duplecast/client_codes/index/unused/',
      BASE + '/client/plugin/duplecast/client_codes/index/all/',
      BASE + '/plugin/duplecast/client_codes/'
    ];
    for (const u of urls) {
      const r = await get(u);
      const re = /client_codes\\/activate\\/(\\d+)\\/?/gi;
      let m; while ((m = re.exec(r.text))) { if (codes.indexOf(m[1]) < 0) codes.push(m[1]); }
      if (codes.length) break;
    }
    if (CFG.test) { done({ ok: true, stage: 'test', codes: codes.slice(0, 20), total: codes.length, log }); return; }
    if (!code) code = codes[0];
    if (!code) { done({ ok: false, stage: 'codes', message: 'Nenhum código Duplecast disponível na conta', log }); return; }

    const actUrl = BASE + '/plugin/duplecast/client_codes/activate/' + code + '/';
    const page = await get(actUrl);
    if (page.status >= 400) { done({ ok: false, stage: 'code', message: 'Código ' + code + ' não encontrado nesta conta', log }); return; }
    const token = csrf(page.text);
    if (!token) { done({ ok: false, stage: 'csrf', message: 'Não foi possível ler o token da tela de ativação', log }); return; }

    const body = new URLSearchParams({ _csrf_token: token, mac: String(CFG.mac).toUpperCase().trim(), code });
    const res = await fetch(actUrl, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const txt = await res.text();
    log.push('POST ' + actUrl + ' -> ' + res.status);
    const err = txt.match(/class=["'][^"']*(?:alert-error|error)[^"']*["'][^>]*>([\\s\\S]{0,300}?)</i);
    if (err) { done({ ok: false, stage: 'activate', message: err[1].replace(/<[^>]+>/g, '').trim(), log }); return; }
    done({ ok: res.status < 400, stage: 'activate', code, status: res.status, log });
  } catch (e) {
    done({ ok: false, stage: 'exception', message: String(e), log });
  }
})();
`;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const { email, password, code, mac, test, probe } = await request.json();
    const isTest = !!test;

    if (probe) {
      const url = PROXY_URL.startsWith("http") ? PROXY_URL : `https://${PROXY_URL}`;
      if (!PROXY_URL) {
        return new Response(JSON.stringify({ ok: false, error: "agente_nao_configurado" }), { headers: jsonHeaders });
      }
      try {
        const r = await fetch(url.replace(/\/$/, "") + "/diag", {
          signal: AbortSignal.timeout(20000),
        });
        const t = (await r.text()).slice(0, 500);
        return new Response(JSON.stringify({ ok: r.ok, status: r.status, body: t }), { headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { headers: jsonHeaders });
      }
    }
    if (!email || !password || (!isTest && !mac)) {
      return new Response(
        JSON.stringify({ error: "email, password e mac são obrigatórios" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    if (!PROXY_URL || !PROXY_SECRET) {
      return new Response(
        JSON.stringify({
          error:
            "O Duplecast exige navegador real (Cloudflare). Configure o agente SeleniumBase (SIGMA_PROXY_URL/SIGMA_PROXY_SECRET).",
        }),
        { status: 503, headers: jsonHeaders },
      );
    }

    const payload = {
      browser: true,
      url: `${BASE}/client/login`,
      wait_ms: 6000,
      steps: [
        { selector: 'input[name="username"]', value: String(email) },
        { selector: 'input[name="password"]', value: String(password) },
        { selector: 'button[type="submit"], input[type="submit"]', click: true, wait_ms: 8000 },
      ],
      js: buildScript({ code: String(code || ""), mac: String(mac || ""), test: isTest }),
    };

    const agentUrl = PROXY_URL.startsWith("http") ? PROXY_URL : `https://${PROXY_URL}`;
    const agentRes = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": PROXY_SECRET },
      body: JSON.stringify(payload),
    });

    if (agentRes.status === 401) {
      return new Response(JSON.stringify({ error: "Chave do agente incorreta." }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    // deno-lint-ignore no-explicit-any
    const data = await agentRes.json().catch(() => null) as any;
    if (!data) {
      return new Response(
        JSON.stringify({ error: `O agente respondeu HTTP ${agentRes.status} sem conteúdo válido.` }),
        { status: 502, headers: jsonHeaders },
      );
    }
    if (data.error) {
      return new Response(
        JSON.stringify({ error: `Agente: ${data.message || data.error}` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const captcha = data.captcha?.status;
    const result = data.js_result;

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "O navegador não conseguiu concluir o acesso ao Duplecast.",
          captcha,
          final_url: data.final_url,
          fields: data.fields,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    if (result.ok === false) {
      return new Response(
        JSON.stringify({ error: result.message || `Falha na etapa ${result.stage}`, detail: result.log, captcha }),
        { status: result.stage === "login" ? 401 : 502, headers: jsonHeaders },
      );
    }

    if (isTest) {
      return new Response(
        JSON.stringify({ success: true, codes_disponiveis: result.total, exemplos: result.codes, captcha }),
        { headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({ success: true, code: result.code, mac: String(mac).toUpperCase().trim() }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[duplecast-activate] erro:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
