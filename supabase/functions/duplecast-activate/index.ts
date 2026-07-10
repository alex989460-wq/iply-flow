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

function mergeSetCookie(jar: Jar, res: Response) {
  // Deno exposes multiple Set-Cookie via getSetCookie()
  // deno-lint-ignore no-explicit-any
  const arr: string[] = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of arr) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
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

async function req(
  jar: Jar,
  url: string,
  init: RequestInit & { formData?: Record<string, string> } = {},
) {
  const headers = new Headers(init.headers || {});
  headers.set("User-Agent", UA);
  headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8");
  if (jar.size) headers.set("Cookie", cookieHeader(jar));

  let body: BodyInit | undefined;
  if (init.formData) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(init.formData).toString();
  } else {
    body = init.body ?? undefined;
  }

  const res = await fetch(url, {
    method: init.method || "GET",
    headers,
    body,
    redirect: "manual",
  });
  mergeSetCookie(jar, res);
  return res;
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

    // 3) GET activation page to grab fresh CSRF
    const codeClean = String(code).replace(/\D/g, "");
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
