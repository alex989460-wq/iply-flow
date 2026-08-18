// Integração com o painel Smarters Max (cms.smartersmax.com / api.smartersmax.com)
// Ações:
//   { action: "test" }                                              -> valida login do revendedor
//   { action: "search", search }                                    -> lista dispositivos
//   { action: "activate", mac, tier?, description? }                -> ativa (usa créditos) um MAC
//   { action: "playlist", mac, device_key, playlist_name, m3u_url, pin? } -> envia lista no app
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const API = "https://api.smartersmax.com";
const AL = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";

const EP = {
  resellerLogin: "sfn0LZOtDUctkbIc2o4a8ArqVz2ugHVy",
  me: "UsD0YG9TJloNQNXryoiHndBuWa7zKDWs",
  devices: "lvX3VQ9G8hCHpM6F0rloe2LOe3IjN66w",
  activate: "dsj0eDazE0eMjj4AqeCTmH1ib2OXLyk6",
  deviceLogin: "6hfUGOe6WhVGR2rbp5DaygDdAq58NKCh",
  deviceInfo: "J6fiNj1qwvmTAKnu5RTwo0RYjZAcJkOJ",
  playlistSave: "ZxpyVerTRPwCTyktXmyscYqFAkgU8y3V",
};

function b64encode(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}
function b64decode(s: string) {
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// Mesmo algoritmo do painel: base64 + ruído aleatório com marcadores de posição.
function encodePayload(obj: unknown) {
  const b = b64encode(JSON.stringify(obj));
  let noiseLen = Math.floor(Math.random() * 30);
  if (noiseLen < 20) noiseLen = 20;
  let pos = Math.floor(Math.random() * b.length);
  if (pos >= 42) pos = 42;
  let noise = "";
  while (noise.length < noiseLen) noise += AL.charAt(Math.floor(Math.random() * AL.length));
  return AL.charAt(pos) + AL.charAt(noiseLen) + b.slice(0, pos) + noise + b.slice(pos);
}

function decodePayload(data: string) {
  const pos = AL.indexOf(data[data.length - 2]);
  const len = AL.indexOf(data[data.length - 1]);
  const body = data.slice(0, data.length - 2);
  return JSON.parse(b64decode(body.slice(0, pos) + body.slice(pos + len)));
}

type Jar = { cookie: string };

async function call(jar: Jar, endpoint: string, payload: unknown): Promise<any> {
  const body = new URLSearchParams({ data: encodePayload(payload ?? {}) }).toString();
  const res = await fetch(`${API}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://cms.smartersmax.com",
      "Referer": "https://cms.smartersmax.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
    },
    body,
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const pieces = setCookie.split(/,(?=[^;]+=[^;]+)/).map((c) => c.split(";")[0].trim());
    const map = new Map<string, string>();
    for (const c of jar.cookie.split("; ").filter(Boolean)) map.set(c.split("=")[0], c);
    for (const c of pieces) map.set(c.split("=")[0], c);
    jar.cookie = [...map.values()].join("; ");
  }

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida do Smarters Max (HTTP ${res.status})`);
  }
  if (parsed?.data && typeof parsed.data === "string") {
    try {
      return decodePayload(parsed.data);
    } catch {
      return parsed;
    }
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "test");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Identifica o revendedor (usuário logado) ou aceita user_id vindo de outra função interna.
    let userId: string | null = body.user_id ?? null;
    const authHeader = req.headers.get("Authorization") || "";
    if (!userId && authHeader) {
      const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await anon.auth.getUser();
      userId = data?.user?.id ?? null;
    }
    if (!userId) return json({ error: "Não autenticado" }, 401);

    let email = String(body.email || "").trim();
    let password = String(body.password || "");

    if (!email || !password) {
      const { data: cred } = await supabase
        .from("activation_panel_credentials")
        .select("username, password, is_enabled")
        .eq("user_id", userId)
        .eq("panel_type", "smartersmax")
        .maybeSingle();
      if (!cred) return json({ error: "Credenciais do Smarters Max não configuradas" }, 400);
      if (action !== "test" && (cred as any).is_enabled === false) {
        return json({ error: "Painel Smarters Max desativado" }, 400);
      }
      email = (cred as any).username || "";
      password = (cred as any).password || "";
    }

    // ── Envio de lista: usa o login do próprio aparelho (MAC + device key) ──
    if (action === "playlist") {
      const mac = String(body.mac || "").trim().toLowerCase();
      const deviceKey = String(body.device_key || "").trim();
      const m3u = String(body.m3u_url || "").trim();
      if (!mac || !deviceKey) return json({ error: "Informe o MAC e a Device Key do aparelho" }, 400);
      if (!m3u) return json({ error: "Informe a URL da lista (M3U)" }, 400);

      const jar: Jar = { cookie: "" };
      const login = await call(jar, EP.deviceLogin, { mac_address: mac, device_key: deviceKey });
      if (!login?.success) return json({ error: login?.message || "MAC ou Device Key inválidos" }, 400);

      const info = await call(jar, EP.deviceInfo, {});
      const deviceId = info?.data?.app_device_id;
      if (!info?.success || !deviceId) return json({ error: info?.message || "Aparelho não encontrado" }, 400);

      const pin = String(body.pin || "").trim();
      const saved = await call(jar, EP.playlistSave, {
        device_id: deviceId,
        playlist_id: -1,
        playlist_name: String(body.playlist_name || "Lista").trim(),
        playlist_url: m3u.replace(/\s+/g, ""),
        protect: pin ? 1 : 0,
        pin,
        playlist_type: "general",
        user_name: "",
        password: "",
      });
      if (!saved?.success) return json({ error: saved?.message || "Falha ao salvar a lista" }, 400);
      return json({ success: true, message: "Lista enviada para o Smarters Max!" });
    }

    // ── Ações do painel do revendedor ──
    if (!email || !password) return json({ error: "Informe e-mail e senha do painel Smarters Max" }, 400);

    const jar: Jar = { cookie: "" };
    const login = await call(jar, EP.resellerLogin, { email, password });
    if (!login?.success) return json({ error: login?.message || "Login recusado pelo Smarters Max" }, 401);

    if (action === "test") {
      const admin = login.admin || {};
      return json({
        success: true,
        name: admin.name,
        credits: Math.max(0, (admin.purchased_credit || 0) - (admin.used_credit || 0)),
        purchased_credit: admin.purchased_credit,
        used_credit: admin.used_credit,
      });
    }

    if (action === "search") {
      const res = await call(jar, EP.devices, {
        app_type: "",
        paid_status: "",
        search: String(body.search || ""),
        start_date: "",
        end_date: "",
        page_size: Number(body.page_size || 20),
        offset: Number(body.offset || 0),
        sort: "c-desc",
      });
      if (!res?.success) return json({ error: res?.message || "Falha ao listar aparelhos" }, 400);
      return json({ success: true, total: res.data?.totalCount || 0, devices: res.data?.devices || [] });
    }

    if (action === "activate") {
      const mac = String(body.mac || "").trim().toLowerCase();
      if (!mac) return json({ error: "MAC do aparelho é obrigatório" }, 400);
      const res = await call(jar, EP.activate, {
        mac_address: mac,
        description: String(body.description || ""),
        tier: Number(body.tier || 1),
      });
      if (!res?.success) return json({ error: res?.message || "Falha ao ativar o aparelho" }, 400);
      return json({ success: true, message: res.message || "Aparelho ativado no Smarters Max!" });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
