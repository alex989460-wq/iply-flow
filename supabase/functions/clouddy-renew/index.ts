// Clouddy (console.clouddy.online) auto-renew via reseller session cookie.
// Login uses Cloudflare Turnstile captcha, so we can't automate it.
// User must paste the full Cookie header from an authenticated browser session
// (DevTools → Network → any /reseller/* request → Request Headers → Cookie).
//
// Flow (from HAR):
//   1) GET  /reseller/users/autocomplete?query=<email>   -> JSON with user id
//      (fallback) GET /reseller/users?find[email]=<email> -> HTML with /reseller/users/{id}
//   2) GET  /reseller/users/{id}/refill/{tariff_id}      -> HTML with _token
//   3) POST /reseller/users/{id}/refill/{tariff_id}      -> 302 success
//        body: form[sum]=X&form[confirm]=1&form[via]=deposit(&form[_token]=...)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
  // Accept JSON cookie export → build name=value; ...
  try {
    const parsed = JSON.parse(s);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const parts = arr
      .filter((c: any) => c && c.name && c.value != null)
      .map((c: any) => `${c.name}=${c.value}`);
    if (parts.length) return parts.join("; ");
  } catch { /* not JSON */ }
  // Strip leading "Cookie:" if present
  return s.replace(/^cookie:\s*/i, "").trim();
}

function extractCsrf(html: string): string | null {
  const m =
    html.match(/name=["']form\[_token\]["']\s+value=["']([^"']+)["']/i) ||
    html.match(/value=["']([^"']+)["']\s+name=["']form\[_token\]["']/i);
  return m ? m[1] : null;
}

function extractUserIdFromHtml(html: string): string | null {
  const m = html.match(/reseller\/users\/(\d+)(?:\/|["'])/);
  return m ? m[1] : null;
}


serve(async (req) => {
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

    const body = await req.json();
    const email = String(body.email || body.username || "").trim();
    const tariffId = Number(body.tariff_id) || 4;
    const sum = body.sum != null ? String(body.sum) : "";
    const via = String(body.via || "deposit");
    const customerId = body.customer_id as string | undefined;
    const bodyUserId = body.user_id as string | undefined;

    if (!email || !sum) {
      return new Response(
        JSON.stringify({ error: "email (do cliente Clouddy) e sum são obrigatórios" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let ownerId = callerUserId || bodyUserId || null;
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
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: cred } = await admin
      .from("activation_panel_credentials")
      .select("username, password, is_enabled")
      .eq("user_id", ownerId)
      .eq("panel_type", "clouddy")
      .maybeSingle();

    if (!cred || !(cred as any).is_enabled) {
      return new Response(
        JSON.stringify({ error: "Clouddy não configurado ou desabilitado" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const baseUrl = String((cred as any).username || "https://console.clouddy.online")
      .replace(/\/+$/, "");
    const cookieHeader = normalizeCookie(String((cred as any).password || ""));
    if (!baseUrl || !cookieHeader) {
      return new Response(
        JSON.stringify({ error: "URL do painel ou cookie da sessão vazios" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const baseHeaders: Record<string, string> = {
      "User-Agent": UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Cookie: cookieHeader,
    };

    // Step 1a: autocomplete lookup
    const acUrl = `${baseUrl}/reseller/users/autocomplete?query=${encodeURIComponent(email)}`;
    const acResp = await fetch(acUrl, {
      headers: { ...baseHeaders, "X-Requested-With": "XMLHttpRequest" },
      redirect: "manual",
    });

    if (acResp.status === 302 || acResp.status === 301) {
      return new Response(
        JSON.stringify({
          error:
            "Sessão Clouddy expirada. Faça login no painel e atualize o cookie nas configurações.",
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    let clientId: string | null = null;
    let debugAc = "";
    let debugFind = "";
    try {
      const acText = await acResp.clone().text();
      debugAc = acText.slice(0, 400);
      const acJson = JSON.parse(acText);
      const list = Array.isArray(acJson) ? acJson : acJson?.results || acJson?.items || acJson?.data || [];
      for (const it of list) {
        const id = it?.id ?? it?.value ?? it?.user_id;
        const label = String(it?.label ?? it?.text ?? it?.email ?? it?.name ?? "").toLowerCase();
        if (id && (list.length === 1 || label.includes(email.toLowerCase()))) {
          clientId = String(id);
          break;
        }
      }
      // If autocomplete returned a single id, use it even without label match
      if (!clientId && list.length === 1) {
        const only = list[0];
        const id = only?.id ?? only?.value ?? only?.user_id;
        if (id) clientId = String(id);
      }
    } catch { /* not JSON, fall back to filter page */ }

    // Step 1b: fallback via POST /reseller/users with filter[email]
    if (!clientId) {
      const findUrl = `${baseUrl}/reseller/users`;
      const filterBody = new URLSearchParams();
      filterBody.set("filter[email]", email);
      const findResp = await fetch(findUrl, {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: baseUrl,
          Referer: findUrl,
        },
        body: filterBody.toString(),
        redirect: "manual",
      });
      let html = "";
      if (findResp.status === 302 || findResp.status === 301) {
        const loc = findResp.headers.get("location") || "";
        if (/\/auth\/login/i.test(loc)) {
          return new Response(
            JSON.stringify({
              error:
                "Sessão Clouddy expirada. Faça login no painel e atualize o cookie nas configurações.",
            }),
            { status: 401, headers: jsonHeaders },
          );
        }
        const followUrl = loc.startsWith("http") ? loc : `${baseUrl}/${loc.replace(/^\/+/, "")}`;
        const r2 = await fetch(followUrl, { headers: baseHeaders, redirect: "manual" });
        html = await r2.text();
      } else {
        html = await findResp.text();
      }
      debugFind = html;
      clientId = extractUserIdFromHtml(html);
    }


    if (!clientId) {
      console.log("[clouddy-renew] AC:", debugAc);
      // dump HTML in chunks to survive log truncation
      for (let i = 0; i < debugFind.length; i += 1500) {
        console.log(`[clouddy-renew] FIND[${i}]:`, debugFind.slice(i, i + 1500));
      }

      return new Response(

        JSON.stringify({ success: false, error: `Cliente "${email}" não encontrado no Clouddy` }),
        { headers: jsonHeaders },
      );
    }

    // Step 2: GET refill/purchase page for CSRF.
    // Contas novas sem tarifa vinculada não têm /refill/{id}; tentamos:
    //   a) /reseller/users/{id}/refill/{tariff}
    //   b) /reseller/users/{id}/purchase/{tariff}
    //   c) /reseller/users/{id}/refill (formulário com form[tariff])
    const candidates = [
      { url: `${baseUrl}/reseller/users/${clientId}/refill/${tariffId}`, withTariffField: false },
      { url: `${baseUrl}/reseller/users/${clientId}/purchase/${tariffId}`, withTariffField: false },
      { url: `${baseUrl}/reseller/users/${clientId}/refill`, withTariffField: true },
    ];

    let refillUrl = "";
    let csrf: string | null = null;
    let withTariffField = false;
    let lastStatus = 0;
    let pageHtml = "";
    for (const c of candidates) {
      const r = await fetch(c.url, { headers: baseHeaders, redirect: "manual" });
      lastStatus = r.status;
      if (r.status === 302 || r.status === 301) {
        const loc = r.headers.get("location") || "";
        if (/\/auth\/login/i.test(loc)) {
          return new Response(
            JSON.stringify({
              error:
                "Sessão Clouddy expirada. Faça login no painel e atualize o cookie nas configurações.",
            }),
            { status: 401, headers: jsonHeaders },
          );
        }
        continue;
      }
      if (!r.ok) continue;
      const html = await r.text();
      const token = extractCsrf(html);
      if (token || /name=["']form\[sum\]["']/i.test(html)) {
        refillUrl = c.url;
        csrf = token;
        withTariffField = c.withTariffField;
        pageHtml = html;
        break;
      }
    }

    if (!refillUrl) {
      return new Response(
        JSON.stringify({
          error: `Nenhum formulário de recarga encontrado para tarifa ${tariffId} (último HTTP ${lastStatus})`,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    // Clouddy calcula o custo real (em USD, com desconto) e o campo form[sum]
    // é readonly — precisa ser exatamente o valor mostrado na página.
    const sumMatch =
      pageHtml.match(/name=["']form\[sum\]["'][^>]*value=["']([^"']+)["']/i) ||
      pageHtml.match(/value=["']([^"']+)["'][^>]*name=["']form\[sum\]["']/i);
    const finalSum = sumMatch ? sumMatch[1] : sum;

    // Step 3: submit refill
    const formBody = new URLSearchParams();
    formBody.set("form[sum]", finalSum);
    formBody.set("form[confirm]", "1");
    formBody.set("form[via]", via);
    if (withTariffField) formBody.set("form[tariff]", String(tariffId));
    if (csrf) formBody.set("form[_token]", csrf);

    const submitResp = await fetch(refillUrl, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: baseUrl,
        Referer: refillUrl,
      },
      body: formBody.toString(),
      redirect: "manual",
    });

    // Success = 302 → /reseller/users/{id}/refill/success
    if (submitResp.status === 302 || submitResp.status === 301) {
      const loc = submitResp.headers.get("location") || "";
      if (/\/refill\/success/i.test(loc)) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Cliente ${email} recarregado no Clouddy (tarifa ${tariffId}, R$ ${sum})`,
            client_id: clientId,
            tariff_id: tariffId,
          }),
          { headers: jsonHeaders },
        );
      }
      // redirect back to form usually means validation error
      return new Response(
        JSON.stringify({
          success: false,
          error: `Recarga rejeitada pelo Clouddy (redirect ${loc || "sem destino"})`,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    if (submitResp.ok) {
      const txt = await submitResp.text();
      console.log(`[clouddy-renew] SUBMIT 200 URL=${refillUrl} withTariffField=${withTariffField}`);
      for (let i = 0; i < txt.length; i += 1500) {
        console.log(`[clouddy-renew] SUBMIT[${i}]:`, txt.slice(i, i + 1500));
      }
      const err =
        txt.match(/class=["'][^"']*(?:alert|error|invalid|help-block)[^"']*["'][^>]*>([\s\S]{0,400}?)</i)?.[1]
          ?.replace(/<[^>]+>/g, "")
          .trim() || null;
      return new Response(
        JSON.stringify({
          success: false,
          error: err || "Clouddy não confirmou a recarga (HTTP 200 sem redirect)",
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const t = (await submitResp.text()).slice(0, 400);
    return new Response(
      JSON.stringify({ error: `Erro na recarga: HTTP ${submitResp.status}`, detail: t }),
      { status: 502, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[clouddy-renew] erro:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
