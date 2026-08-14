// Duplecast auto-activation via reseller client area (Blesta panel)
// Flow (extracted from HAR):
//  1) GET  /client/login                                     -> cookies + _csrf_token
//  2) POST /client/login (_csrf_token, username, password)   -> session (302)
//  3) GET  /plugin/duplecast/client_codes/activate/{code}/   -> new _csrf_token
//  4) POST same URL (_csrf_token, mac, code)                 -> 302 success

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://duplecast.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

type Jar = Map<string, string>;

type Res = { status: number; text: () => Promise<string> };

function mergeCookieStrings(jar: Jar, arr: string[]) {
  for (const c of arr) {
    const [pair] = String(c).split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function mergeSetCookie(jar: Jar, res: Response) {
  // Deno exposes multiple Set-Cookie via getSetCookie()
  // deno-lint-ignore no-explicit-any
  mergeCookieStrings(jar, (res.headers as any).getSetCookie?.() ?? []);
}
function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function extractCsrf(html: string): string | null {
  const m =
    html.match(/name=["']_csrf_token["']\s+value=["']([a-f0-9]+)["']/i) ||
    html.match(/value=["']([a-f0-9]+)["']\s+name=["']_csrf_token["']/i);
  return m ? m[1] : null;
}

// Proxy residencial (mesmo usado pelo Sigma). O Duplecast está atrás do
// Cloudflare e recusa chamadas vindas de datacenter, então, quando o proxy
// estiver configurado, todas as requisições saem por ele.
const PROXY_URL = String(Deno.env.get("SIGMA_PROXY_URL") || "").trim().replace(/\/+$/, "");
const PROXY_SECRET = String(Deno.env.get("SIGMA_PROXY_SECRET") || "").trim();
const useProxy = !!PROXY_URL && !!PROXY_SECRET;

async function req(
  jar: Jar,
  url: string,
  init: RequestInit & { formData?: Record<string, string> } = {},
): Promise<Res> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  };
  for (const [k, v] of Object.entries((init.headers || {}) as Record<string, string>)) {
    headers[k] = String(v);
  }
  if (jar.size) headers["Cookie"] = cookieHeader(jar);

  let body: string | undefined;
  if (init.formData) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.formData).toString();
  } else if (typeof init.body === "string") {
    body = init.body;
  }

  const method = init.method || "GET";

  if (useProxy) {
    const proxyRes = await fetch(PROXY_URL.startsWith("http") ? PROXY_URL : `https://${PROXY_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": PROXY_SECRET },
      body: JSON.stringify({ url, method, headers, body, redirect: "manual" }),
    });
    // deno-lint-ignore no-explicit-any
    const payload = await proxyRes.json().catch(() => null) as any;
    if (proxyRes.status === 401) throw new Error("Chave do proxy residencial incorreta.");
    if (!payload || typeof payload.status !== "number") {
      throw new Error(`O proxy residencial respondeu com erro: ${payload?.message || payload?.error || `HTTP ${proxyRes.status}`}`);
    }
    if (Array.isArray(payload.cookies)) mergeCookieStrings(jar, payload.cookies);
    else if (payload.headers?.["set-cookie"]) mergeCookieStrings(jar, [String(payload.headers["set-cookie"])]);
    const text = String(payload.body ?? "");
    return { status: payload.status, text: () => Promise.resolve(text) };
  }

  const res = await fetch(url, { method, headers, body, redirect: "manual" });
  mergeSetCookie(jar, res);
  const text = await res.text();
  return { status: res.status, text: () => Promise.resolve(text) };
}


serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const { email, password, code, mac } = await request.json();
    if (!email || !password || !mac) {
      return new Response(
        JSON.stringify({ error: "email, password e mac são obrigatórios" }),
        { status: 400, headers: jsonHeaders },
      );
    }


    const jar: Jar = new Map();

    // 1) load login page
    const loginPage = await req(jar, `${BASE}/client/login`);
    const loginHtml = await loginPage.text();
    const loginCsrf = extractCsrf(loginHtml);
    if (!loginCsrf) {
      return new Response(JSON.stringify({ error: "Falha ao obter CSRF de login" }), {
        status: 502,
        headers: jsonHeaders,
      });
    }

    // 2) submit login
    const loginRes = await req(jar, `${BASE}/client/login`, {
      method: "POST",
      formData: { _csrf_token: loginCsrf, username: email, password },
      headers: { Referer: `${BASE}/client/login`, Origin: BASE },
    });
    if (loginRes.status !== 302) {
      return new Response(
        JSON.stringify({ error: "Login inválido (credenciais Duplecast incorretas)" }),
        { status: 401, headers: jsonHeaders },
      );
    }

    // Follow redirect to ensure session cookies stick
    await req(jar, `${BASE}/plugin/duplecast/device_main/`);

    // 3) Auto-pick an unused code if not provided.
    // IMPORTANTE: a listagem padrão ("all") mostra primeiro os códigos JÁ USADOS,
    // que não possuem link de ativação. É preciso consultar o filtro "unused".
    let codeClean = String(code || "").replace(/\D/g, "");
    if (!codeClean) {
      const listUrls = [
        `${BASE}/client/plugin/duplecast/client_codes/index/unused/`,
        `${BASE}/plugin/duplecast/client_codes/index/unused/`,
        `${BASE}/client/plugin/duplecast/client_codes/index/all/`,
        `${BASE}/plugin/duplecast/client_codes/`,
      ];
      const found = new Set<string>();
      for (const url of listUrls) {
        const listRes = await req(jar, url);
        const listHtml = await listRes.text();
        const re = /client_codes\/activate\/(\d+)\/?/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(listHtml))) found.add(m[1]);
        if (found.size) break;
      }
      const first = [...found][0];
      if (!first) {
        return new Response(
          JSON.stringify({ error: "Nenhum código Duplecast disponível na sua conta para ativar" }),
          { status: 404, headers: jsonHeaders },
        );
      }
      codeClean = first;
    }

    const actUrl = `${BASE}/plugin/duplecast/client_codes/activate/${codeClean}/`;

    const actPage = await req(jar, actUrl);
    const actHtml = await actPage.text();
    if (actPage.status >= 400) {
      return new Response(
        JSON.stringify({ error: `Código ${codeClean} não encontrado nesta conta Duplecast` }),
        { status: 404, headers: jsonHeaders },
      );
    }
    const actCsrf = extractCsrf(actHtml);
    if (!actCsrf) {
      return new Response(JSON.stringify({ error: "Falha ao obter CSRF de ativação" }), {
        status: 502,
        headers: jsonHeaders,
      });
    }

    // 4) submit activation
    const macClean = String(mac).toUpperCase().trim();
    const submit = await req(jar, actUrl, {
      method: "POST",
      formData: { _csrf_token: actCsrf, mac: macClean, code: codeClean },
      headers: { Referer: actUrl, Origin: BASE },
    });

    if (submit.status !== 302 && submit.status !== 200) {
      const txt = (await submit.text()).slice(0, 500);
      return new Response(
        JSON.stringify({ error: "Falha na ativação", status: submit.status, detail: txt }),
        { status: 502, headers: jsonHeaders },
      );
    }

    // Detect inline error on 200 response
    if (submit.status === 200) {
      const body = await submit.text();
      const errMatch = body.match(/class=["']alert[^"']*error[^"']*["'][^>]*>([\s\S]{0,300}?)</i);
      if (errMatch) {
        return new Response(
          JSON.stringify({ error: errMatch[1].replace(/<[^>]+>/g, "").trim() }),
          { status: 400, headers: jsonHeaders },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, code: codeClean, mac: macClean }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[duplecast-activate] erro:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
