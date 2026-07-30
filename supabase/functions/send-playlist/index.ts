// Envio de lista (playlist M3U/EPG) para os painéis de apps.
//
// Provedores suportados:
//  - clouddy  → usa o cookie de sessão salvo em activation_panel_credentials (panel_type = clouddy)
//               POST {base}/reseller/users-tv-playlists/add   (multipart: form[email], form[url], form[epg])
//               POST {base}/reseller/users-vod-playlists/add  (multipart: form[email], form[url])
//  - ibopro   → api.iboproapp.com (mesma assinatura do site iboproapp.com/manage-playlists)
//               POST /auth/login  { mac, password }  → token
//               POST /playlistw   { mac_address, playlist_name, playlist_url, ... }

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

// ───────────────────────── IBO Pro (assinatura dos headers) ─────────────────────────
const iboWrap = (t: string) =>
  t.length >= 6
    ? t.slice(0, 3) + "iBo" + t.slice(3, t.length - 3) + "PrO" + t.slice(t.length - 3)
    : t.length >= 3
    ? t.slice(0, 3) + "iBo" + t.slice(3)
    : t + "PrO";

const b64 = (s: string) => {
  const bin = new TextEncoder().encode(s);
  let out = "";
  for (const b of bin) out += String.fromCharCode(b);
  return btoa(out);
};

const iboHash = (t: string) => iboWrap(b64(iboWrap(t)));

function iboSign(t: string): string {
  const e = Date.now().toString();
  const n = iboHash(t + e);
  const digits: number[] = [];
  let i = e.length - 1;
  while (digits.length < 3 && i >= 0) {
    const c = e.charAt(i);
    if (c > "0") digits.push(parseInt(c));
    i--;
  }
  while (digits.length < 3) digits.push(1);
  const [r, a, ii] = digits;
  const bytes = new TextEncoder().encode(n).map(
    (b, idx) => b + ((Math.pow(r, a) + Math.pow(a + idx, 3) + (r + a) * (ii + idx)) % 5),
  );
  const c = new TextDecoder().decode(bytes);
  return b64(c + e);
}

function iboHeaders(mac: string, key?: string): Record<string, string> {
  const n = Date.now();
  const e = key || Math.random().toString(36).slice(2, 8);
  return {
    "X-Gc-Token": iboSign(`${mac}${n}${2 * n}`),
    "x-hash": iboSign(`${mac}___${e}`),
    "x-hash-2": iboSign(`${mac}___${e}__${n}`),
    "x-token": iboSign(`${mac}${n}`),
    "x-token-2": iboSign(mac),
    "x-token-3": iboHash(mac),
  };
}

export function normalizeMac(raw: string): string {
  const clean = String(raw || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (clean.length !== 12) return String(raw || "").trim().toLowerCase();
  return clean.match(/.{2}/g)!.join(":");
}

// ───────────────────────── Duplecast (sessão do painel do revendedor) ─────────────────────────
class CookieJar {
  private jar = new Map<string, string>();
  absorb(resp: Response) {
    // Deno expõe múltiplos Set-Cookie via getSetCookie()
    const raws: string[] = (resp.headers as any).getSetCookie?.() ??
      (resp.headers.get("set-cookie") ? [resp.headers.get("set-cookie")!] : []);
    for (const raw of raws) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function extractCsrf(html: string): string {
  return (
    html.match(/name=["']_csrf_token["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']_csrf_token["']/i)?.[1] ||
    ""
  );
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
    const m3uUrl = String(body.m3u_url || "").trim();

    if (!isHttpUrl(m3uUrl)) {
      return new Response(JSON.stringify({ error: "URL da lista (M3U) inválida" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // ───────────────────────────── IBO PRO ─────────────────────────────
    if (provider === "ibopro") {
      const mac = normalizeMac(String(body.mac || ""));
      const deviceKey = String(body.device_key || body.password || "").trim();
      const name = String(body.playlist_name || "").trim() || "Lista";
      const pin = String(body.pin || "").trim();
      const isProtected = !!body.is_protected && !!pin;

      if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) {
        return new Response(
          JSON.stringify({ error: "MAC inválido. Use o formato aa:bb:cc:dd:ee:ff" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      if (!deviceKey) {
        return new Response(
          JSON.stringify({ error: "Informe a Device Key (senha exibida no app IBO Pro)" }),
          { status: 400, headers: jsonHeaders },
        );
      }

      const base = "https://api.iboproapp.com";
      const commonHeaders = {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        Origin: "https://iboproapp.com",
        Referer: "https://iboproapp.com/",
        "User-Agent": UA,
      };

      const loginResp = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { ...commonHeaders, ...iboHeaders(mac, deviceKey) },
        body: JSON.stringify({ mac, password: deviceKey }),
      });
      const loginJson = await loginResp.json().catch(() => ({} as any));
      if (!loginJson?.status || !loginJson?.token) {
        return new Response(
          JSON.stringify({
            error: loginJson?.message || `Falha ao autenticar no IBO Pro (HTTP ${loginResp.status})`,
          }),
          { status: 401, headers: jsonHeaders },
        );
      }

      const addResp = await fetch(`${base}/playlistw`, {
        method: "POST",
        headers: {
          ...commonHeaders,
          ...iboHeaders(mac),
          Authorization: `Bearer ${loginJson.token}`,
        },
        body: JSON.stringify({
          mac_address: mac,
          playlist_name: name,
          playlist_url: m3uUrl,
          playlist_id: null,
          playlist_type: "URL",
          playlist_host: "",
          playlist_username: "",
          playlist_password: "",
          is_protected: isProtected,
          type: "URL",
          pin: pin,
        }),
      });
      const addJson = await addResp.json().catch(() => ({} as any));

      if (addResp.ok && addJson?.status !== false) {
        return new Response(
          JSON.stringify({
            success: true,
            provider: "ibopro",
            mac,
            message: addJson?.message || `Lista "${name}" enviada para o IBO Pro (${mac})`,
          }),
          { headers: jsonHeaders },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: addJson?.message || `Erro HTTP ${addResp.status} ao enviar a lista no IBO Pro`,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    // ───────────────────────────── CLOUDDY ─────────────────────────────
    if (provider !== "clouddy") {
      return new Response(
        JSON.stringify({
          error:
            "Envio automático disponível para Clouddy e IBO Pro no momento. Duplecast / Bob Player exigem envio manual.",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const email = String(body.email || "").trim();
    const epgUrl = String(body.epg_url || "").trim();
    const sendTv = body.send_tv !== false;
    const sendVod = body.send_vod !== false;

    if (!isEmail(email)) {
      return new Response(JSON.stringify({ error: "E-mail do cliente inválido" }), {
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

    let baseUrl = String((cred as any).username || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = "https://console.clouddy.online";
    const cookieHeader = normalizeCookie(String((cred as any).password || ""));
    if (!cookieHeader) {
      return new Response(
        JSON.stringify({ error: "Cookie da sessão Clouddy vazio — atualize em Ativação de Apps → Painéis" }),
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

      if (resp.status >= 300 && resp.status < 400) {
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
          message: err || `Clouddy não confirmou o envio de ${kind} (verifique se o e-mail existe no painel)`,
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
          : Object.values(results).map((r: any) => r?.message).filter(Boolean).join(" | ") ||
            "Envio concluído com falhas",
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
