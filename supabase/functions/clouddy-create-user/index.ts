// Cria usuário no painel Clouddy (console.clouddy.online/reseller/users/add)
// Usa o cookie de sessão do revendedor salvo em activation_panel_credentials (panel_type = 'clouddy').
//
// Fluxo (do HAR):
//   1) GET  /reseller/users/add            -> (opcional) form[_token]
//   2) POST /reseller/users/add            -> 301/302 para /reseller/users/{id}/edit
//      body: form[email]=..&form[password]=..&form[status]=1&form[pin]=0000&form[timezone]=&form[notes]=&apply=

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

function normalizeCookie(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const parsed = JSON.parse(s);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const parts = arr
      .filter((c: any) => c && c.name && c.value != null)
      .map((c: any) => `${c.name}=${c.value}`);
    if (parts.length) return parts.join("; ");
  } catch { /* not JSON */ }
  return s.replace(/^cookie:\s*/i, "").trim();
}

function extractCsrf(html: string): string | null {
  const m =
    html.match(/name=["']form\[_token\]["']\s+value=["']([^"']+)["']/i) ||
    html.match(/value=["']([^"']+)["']\s+name=["']form\[_token\]["']/i);
  return m ? m[1] : null;
}

function randomDigits(n: number) {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const internalSecret = req.headers.get("x-cakto-webhook-secret");
    const isInternal =
      !!Deno.env.get("CAKTO_WEBHOOK_SECRET") &&
      internalSecret === Deno.env.get("CAKTO_WEBHOOK_SECRET");

    let callerUserId: string | null = null;
    if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      const supa = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error } = await supa.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      callerUserId = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const ownerId = callerUserId || (body.user_id as string | undefined);
    if (!ownerId) {
      return new Response(JSON.stringify({ error: "Revendedor não identificado" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const email = String(body.email || "").trim() || randomDigits(8);
    const password = String(body.password || "").trim() || randomDigits(8);
    const pin = String(body.pin || "0000").replace(/\D/g, "").slice(0, 6) || "0000";
    const notes = String(body.notes || "");
    const timezone = String(body.timezone || "");
    const status = String(body.status ?? "1");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: cred } = await admin
      .from("activation_panel_credentials")
      .select("username, password, is_enabled")
      .eq("user_id", ownerId)
      .eq("panel_type", "clouddy")
      .maybeSingle();

    if (!cred || !(cred as any).is_enabled) {
      return new Response(
        JSON.stringify({ error: "Clouddy não configurado ou desabilitado (aba Painéis)" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const baseUrl = String((cred as any).username || "https://console.clouddy.online")
      .replace(/\/+$/, "");
    const cookieHeader = normalizeCookie(String((cred as any).password || ""));
    if (!cookieHeader) {
      return new Response(JSON.stringify({ error: "Cookie da sessão Clouddy vazio" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const baseHeaders: Record<string, string> = {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Cookie: cookieHeader,
    };

    const addUrl = `${baseUrl}/reseller/users/add`;

    // 1) GET página para pegar CSRF (quando existir)
    const page = await fetch(addUrl, { headers: baseHeaders, redirect: "manual" });
    if (page.status === 301 || page.status === 302) {
      const loc = page.headers.get("location") || "";
      if (/auth\/login/i.test(loc)) {
        return new Response(
          JSON.stringify({
            error:
              "Sessão Clouddy expirada. Faça login no painel e atualize o cookie nas configurações.",
          }),
          { status: 401, headers: jsonHeaders },
        );
      }
    }
    const pageHtml = page.ok ? await page.text() : "";
    const csrf = pageHtml ? extractCsrf(pageHtml) : null;

    // 2) POST criação
    const form = new URLSearchParams();
    form.set("form[email]", email);
    form.set("form[password]", password);
    form.set("form[status]", status);
    form.set("form[pin]", pin);
    form.set("form[timezone]", timezone);
    form.set("form[notes]", notes);
    if (csrf) form.set("form[_token]", csrf);
    form.set("apply", "");

    const resp = await fetch(addUrl, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: baseUrl,
        Referer: addUrl,
      },
      body: form.toString(),
      redirect: "manual",
    });

    const location = resp.headers.get("location") || "";
    if (resp.status === 301 || resp.status === 302) {
      if (/auth\/login/i.test(location)) {
        return new Response(
          JSON.stringify({ error: "Sessão Clouddy expirada. Atualize o cookie." }),
          { status: 401, headers: jsonHeaders },
        );
      }
      const idMatch = location.match(/users\/(\d+)/);
      return new Response(
        JSON.stringify({
          success: true,
          email,
          password,
          pin,
          clouddy_user_id: idMatch ? idMatch[1] : null,
        }),
        { headers: jsonHeaders },
      );
    }

    const html = await resp.text();
    const errMatch =
      html.match(/class=["'][^"']*(?:invalid-feedback|help-block|alert-danger)[^"']*["'][^>]*>([\s\S]{0,300}?)</i);
    const detail = errMatch ? errMatch[1].replace(/<[^>]+>/g, "").trim() : `HTTP ${resp.status}`;

    console.error("[clouddy-create-user] falha:", resp.status, detail);
    return new Response(
      JSON.stringify({ error: `Falha ao criar usuário no Clouddy: ${detail}` }),
      { status: 502, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[clouddy-create-user]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
