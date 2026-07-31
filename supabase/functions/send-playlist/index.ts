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

    // Bob Player / IBO Player: gera o captcha (SVG) que o usuário digita no painel.
    if (String(body.action || "") === "bob-captcha") {
      const capBase = provider === "iboplayer" ? "https://iboplayer.com" : "https://bobplayer.com";
      const capRef = provider === "iboplayer" ? `${capBase}/device/login` : `${capBase}/login`;
      const capResp = await fetch(`${capBase}/frontend/captcha/generate`, {
        headers: { Accept: "application/json", Referer: capRef, "User-Agent": UA },
      });
      const cap = await capResp.json().catch(() => ({} as any));
      if (!cap?.svg || !cap?.token) {
        return new Response(JSON.stringify({ error: "Não foi possível gerar o captcha" }), {
          status: 502,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ success: true, svg: cap.svg, token: cap.token }), {
        headers: jsonHeaders,
      });
    }


    if (!isHttpUrl(m3uUrl)) {
      return new Response(JSON.stringify({ error: "URL da lista (M3U) inválida" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // ──────────────────── BOB PLAYER / IBO PLAYER ────────────────────
    if (provider === "bobplayer" || provider === "iboplayer") {

      const mac = normalizeMac(String(body.mac || ""));
      const deviceKey = String(body.device_key || body.password || "").trim();
      const name = String(body.playlist_name || "").trim() || "Lista";
      const pin = String(body.pin || "").trim();
      const epgUrlB = String(body.epg_url || "").trim() || m3uUrl;
      const captcha = String(body.captcha || "").trim();
      const capToken = String(body.captcha_token || body.token || "").trim();

      if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) {
        return new Response(JSON.stringify({ error: "MAC inválido. Use o formato aa:bb:cc:dd:ee:ff" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      if (!deviceKey) {
        return new Response(JSON.stringify({ error: "Informe a Device Key (senha exibida no app)" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      if (!captcha || !capToken) {
        return new Response(JSON.stringify({ error: "Digite o captcha exibido para continuar" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const jar = new CookieJar();
      const base = "https://bobplayer.com";
      const commonB: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        Origin: base,
        "User-Agent": UA,
      };

      const loginB = await fetch(`${base}/frontend/device/login`, {
        method: "POST",
        headers: { ...commonB, Referer: `${base}/login` },
        body: JSON.stringify({
          mac_address: mac,
          device_key: deviceKey,
          captcha,
          token: capToken,
        }),
      });
      jar.absorb(loginB);
      const loginBJson = await loginB.json().catch(() => ({} as any));
      if (!loginB.ok || loginBJson?.status !== "success") {
        return new Response(
          JSON.stringify({
            error: loginBJson?.message || `Falha ao autenticar no Bob Player (HTTP ${loginB.status})`,
          }),
          { status: 401, headers: jsonHeaders },
        );
      }

      const saveB = await fetch(`${base}/frontend/device/savePlaylist`, {
        method: "POST",
        headers: {
          ...commonB,
          Referer: `${base}/dashboard`,
          "x-client-origin": base,
          Cookie: jar.header(),
        },
        body: JSON.stringify({
          current_playlist_url_id: -1,
          playlist_url: m3uUrl,
          playlist_name: name,
          username: "",
          password: "",
          playlist_type: "general",
          protect: pin ? 1 : 0,
          xml_url: epgUrlB,
          pin: pin,
        }),
      });
      const saveBJson = await saveB.json().catch(() => ({} as any));
      if (saveB.ok && saveBJson?.status === "success") {
        return new Response(
          JSON.stringify({
            success: true,
            provider: "bobplayer",
            mac,
            message: saveBJson?.msg || `Lista "${name}" enviada para o Bob Player (${mac})`,
          }),
          { headers: jsonHeaders },
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: saveBJson?.msg || saveBJson?.message || `Erro HTTP ${saveB.status} ao salvar a lista no Bob Player`,
        }),
        { status: 502, headers: jsonHeaders },
      );
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

    // ───────────────────────────── DUPLECAST ─────────────────────────────
    if (provider === "duplecast") {
      const mac = normalizeMac(String(body.mac || "")).toUpperCase();
      const deviceKey = String(body.device_key || body.password || "").trim();
      const name = String(body.playlist_name || "").trim() || "Lista";
      const epgUrlD = String(body.epg_url || "").trim();
      const pin = String(body.pin || "").trim();

      if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
        return new Response(
          JSON.stringify({ error: "MAC inválido. Use o formato AA:BB:CC:DD:EE:FF" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      if (!deviceKey) {
        return new Response(
          JSON.stringify({ error: "Informe a Device Key (código exibido no aparelho)" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      if (epgUrlD && !isHttpUrl(epgUrlD)) {
        return new Response(JSON.stringify({ error: "URL do EPG inválida" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const adminD = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: credD } = await adminD
        .from("activation_panel_credentials")
        .select("username, password, is_enabled")
        .eq("user_id", ownerId)
        .eq("panel_type", "duplecast")
        .maybeSingle();

      if (!credD || !(credD as any).username || !(credD as any).password) {
        return new Response(
          JSON.stringify({
            error: "Credenciais do painel Duplecast não configuradas (Ativação de Apps → Painéis)",
          }),
          { status: 400, headers: jsonHeaders },
        );
      }

      const BASE = "https://duplecast.com";
      const jar = new CookieJar();
      const nav = (referer: string) => ({
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Cookie: jar.header(),
        Origin: BASE,
        Referer: referer,
      });

      async function getPage(path: string) {
        const r = await fetch(`${BASE}${path}`, {
          headers: {
            "User-Agent": UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            Cookie: jar.header(),
            Referer: BASE + path,
          },
          redirect: "manual",
        });
        jar.absorb(r);
        return { status: r.status, html: await r.text().catch(() => "") };
      }

      async function postForm(path: string, fields: Record<string, string>) {
        const r = await fetch(`${BASE}${path}`, {
          method: "POST",
          headers: {
            ...nav(BASE + path),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(fields).toString(),
          redirect: "manual",
        });
        jar.absorb(r);
        const html = r.status >= 300 && r.status < 400 ? "" : await r.text().catch(() => "");
        return { status: r.status, location: r.headers.get("location") || "", html };
      }

      const pickError = (html: string) =>
        html
          .match(/class=["'][^"']*(?:alert-danger|alert danger|error|invalid)[^"']*["'][^>]*>([\s\S]{0,250}?)</i)?.[1]
          ?.replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();

      // 1) Login do revendedor
      const loginPage = await getPage("/client/login");
      const loginCsrf = extractCsrf(loginPage.html);
      const login = await postForm("/client/login", {
        _csrf_token: loginCsrf,
        username: String((credD as any).username).trim(),
        password: String((credD as any).password),
        remember_me: "true",
      });
      if (!(login.status >= 300 && login.status < 400)) {
        return new Response(
          JSON.stringify({
            error: pickError(login.html) || "Falha ao entrar no painel Duplecast (verifique e-mail/senha)",
          }),
          { status: 401, headers: jsonHeaders },
        );
      }

      // 2) Login no dispositivo (MAC + device key)
      const devPage = await getPage("/client/plugin/duplecast/device_login/");
      const devCsrf = extractCsrf(devPage.html);
      const devLogin = await postForm("/client/plugin/duplecast/device_login/", {
        _csrf_token: devCsrf,
        mac,
        device_key: deviceKey,
      });
      if (!(devLogin.status >= 300 && devLogin.status < 400)) {
        return new Response(
          JSON.stringify({
            error:
              pickError(devLogin.html) ||
              "Duplecast não aceitou o MAC/Device Key. Confira os dados exibidos no aparelho.",
          }),
          { status: 400, headers: jsonHeaders },
        );
      }

      // 3) Cadastro da playlist
      const addPage = await getPage("/client/plugin/duplecast/device_main/add/");
      const addCsrf = extractCsrf(addPage.html);
      const fields: Record<string, string> = {
        _csrf_token: addCsrf,
        form_action: "generate_m3u_playlist",
        m3u_name: name,
        m3u_playlist: m3uUrl,
        epg_url: epgUrlD,
        note: "",
      };
      if (pin) {
        fields.locked = "1";
        fields.pin = pin;
        fields.confirm_pin = pin;
      }
      const add = await postForm("/client/plugin/duplecast/device_main/add/", fields);

      if (add.status >= 300 && add.status < 400) {
        return new Response(
          JSON.stringify({
            success: true,
            provider: "duplecast",
            mac,
            message: `Lista "${name}" enviada para o Duplecast (${mac})`,
          }),
          { headers: jsonHeaders },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: pickError(add.html) || `Duplecast não confirmou o cadastro da lista (HTTP ${add.status})`,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    // ───────────────────────────── CLOUDDY ─────────────────────────────
    if (provider !== "clouddy") {
      return new Response(
        JSON.stringify({
          error: "Provedor não suportado. Use Clouddy, IBO Pro ou Duplecast.",
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
