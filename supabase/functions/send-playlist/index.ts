// Envio de lista (playlist M3U/EPG) para os painéis de apps.
// Hoje suportado de forma automática: Clouddy (console.clouddy.online),
// usando o cookie de sessão do revendedor salvo em activation_panel_credentials.
//
// Fluxo (capturado do painel):
//   POST {base}/reseller/users-tv-playlists/add   (multipart: form[email], form[url], form[epg])
//   POST {base}/reseller/users-vod-playlists/add  (multipart: form[email], form[url])

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
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
    const { data: { user }, error: authError } = await supa.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    // O dono é sempre o usuário autenticado — nunca aceitar user_id do corpo.
    const ownerId = user.id;

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || "clouddy").toLowerCase();
    const email = String(body.email || "").trim();
    const m3uUrl = String(body.m3u_url || "").trim();
    const epgUrl = String(body.epg_url || "").trim();
    const sendTv = body.send_tv !== false;
    const sendVod = body.send_vod !== false;

    if (!isEmail(email)) {
      return new Response(JSON.stringify({ error: "E-mail do cliente inválido" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    if (!isHttpUrl(m3uUrl)) {
      return new Response(JSON.stringify({ error: "URL da lista (M3U) inválida" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    if (epgUrl && !isHttpUrl(epgUrl)) {
      return new Response(JSON.stringify({ error: "URL do EPG inválida" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    if (!sendTv && !sendVod) {
      return new Response(
        JSON.stringify({ error: "Selecione ao menos Canais (TV) ou Filmes (VOD)" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    if (provider !== "clouddy") {
      return new Response(
        JSON.stringify({
          error:
            "Envio automático disponível apenas para Clouddy no momento. IBO Pro / Duplecast / Bob Player exigem envio manual (proteção anti-bot).",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

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
        JSON.stringify({ error: "Clouddy não configurado ou desabilitado nas suas credenciais" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const baseUrl = String((cred as any).username || "https://console.clouddy.online")
      .replace(/\/+$/, "");
    const cookieHeader = normalizeCookie(String((cred as any).password || ""));
    if (!baseUrl || !cookieHeader) {
      return new Response(
        JSON.stringify({ error: "URL do painel ou cookie da sessão Clouddy vazios" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const baseHeaders: Record<string, string> = {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Cookie: cookieHeader,
    };

    async function submit(kind: "tv" | "vod") {
      const url = `${baseUrl}/reseller/users-${kind}-playlists/add`;
      const form = new FormData();
      form.set("form[email]", email);
      form.set("form[m3u]", new File([new Uint8Array()], "", { type: "application/octet-stream" }));
      form.set("form[url]", m3uUrl);
      if (kind === "tv") form.set("form[epg]", epgUrl || m3uUrl);

      const resp = await fetch(url, {
        method: "POST",
        headers: { ...baseHeaders, Origin: baseUrl, Referer: url },
        body: form,
        redirect: "manual",
      });

      if (resp.status === 301 || resp.status === 302) {
        const loc = resp.headers.get("location") || "";
        if (/\/auth\/login/i.test(loc)) {
          return { ok: false, expired: true, message: "Sessão Clouddy expirada" };
        }
        return { ok: true, message: `Lista de ${kind === "tv" ? "canais" : "filmes"} enviada` };
      }

      if (resp.ok) {
        const html = await resp.text();
        const err = html
          .match(/class=["'][^"']*(?:alert-danger|error|invalid|help-block)[^"']*["'][^>]*>([\s\S]{0,300}?)</i)?.[1]
          ?.replace(/<[^>]+>/g, "")
          .trim();
        return {
          ok: false,
          message: err || `Clouddy não confirmou o envio de ${kind} (HTTP 200 sem redirect)`,
        };
      }

      return { ok: false, message: `Erro HTTP ${resp.status} ao enviar ${kind}` };
    }

    const results: Record<string, unknown> = {};
    let expired = false;

    if (sendTv) {
      const r = await submit("tv");
      results.tv = r;
      if ((r as any).expired) expired = true;
    }
    if (sendVod && !expired) {
      const r = await submit("vod");
      results.vod = r;
      if ((r as any).expired) expired = true;
    }

    if (expired) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Sessão Clouddy expirada. Faça login no painel e atualize o cookie em Ativação de Apps → Painéis.",
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const allOk = Object.values(results).every((r: any) => r?.ok);
    return new Response(
      JSON.stringify({
        success: allOk,
        email,
        results,
        message: allOk
          ? `Lista enviada para ${email}`
          : "Envio concluído com falhas — verifique os detalhes",
      }),
      { status: allOk ? 200 : 502, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[send-playlist] erro:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
