// Integração com CRM Oficial (https://zapcrm.top)
// Ações suportadas (todas idempotentes, falham silenciosamente para não quebrar fluxo):
//   - signup       : cria conta no CRM para um novo revendedor
//   - test-chat    : cria contato + mensagem (in) no inbox da conta master, simulando chat de teste
//   - renew-notify : registra renovação no inbox master via /messages (direction=in)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRM_BASE = "https://zapcrm.top";
const CRM_SUPABASE_URL = "https://qoijgbmbwcmnmvixsbrv.supabase.co";
const CRM_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaWpnYm1id2Ntbm12aXhzYnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjI3MTIsImV4cCI6MjA5NzI5ODcxMn0.IgBFtqw8O2bwmOFU3iWIwkvUZ2_KWOK_-CGWt2P1buw";

type Action =
  | "signup" | "provision-key" | "ensure-key" | "repair-missing" | "test-chat" | "renew-notify" | "ping"
  | "list-conversations" | "list-messages" | "send-whatsapp" | "mark-read"
  | "list-contacts" | "list-channels" | "create-channel" | "channel-qr" | "set-primary-channel" | "delete-channel" | "embedded-signup" | "get-media"
  | "upload-media"
  | "list-templates" | "create-template" | "update-template" | "delete-template"
  | "list-chatbots" | "create-chatbot" | "update-chatbot" | "delete-chatbot"
  | "sso-token";

async function crmFetch(path: string, init: RequestInit & { withAuth?: boolean; apiKey?: string } = {}) {
  const apiKey = init.apiKey || Deno.env.get("CRM_OFICIAL_API_KEY") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.withAuth !== false && apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  const res = await fetch(`${CRM_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

function authKeys(preferred?: string) {
  const envKey = Deno.env.get("CRM_OFICIAL_API_KEY") || "";
  return [preferred || "", envKey].map((key) => key.trim()).filter((key, index, arr) => key && arr.indexOf(key) === index);
}

async function crmFetchWithKeyFallback(path: string, init: RequestInit & { withAuth?: boolean } = {}, preferredApiKey?: string) {
  const keys = authKeys(preferredApiKey);
  if (!keys.length) return crmFetch(path, init);
  return firstOk(keys.map((key) => () => crmFetch(path, { ...init, apiKey: key })));
}

const KNOWN_FOREIGN_COUNTRY_CODES = [
  "971", "598", "595", "593", "591", "353", "351",
  "86", "81", "61", "58", "57", "56", "54", "52", "51", "49", "44", "41", "39", "34", "33", "32", "31",
];

function hasKnownForeignCountryCode(digits: string) {
  return KNOWN_FOREIGN_COUNTRY_CODES.some((ddi) => digits.startsWith(ddi) && digits.length > ddi.length);
}

function stripAccidentalBrazilPrefix(digits: string) {
  if (!digits.startsWith("55")) return digits;
  const withoutBrazilCode = digits.slice(2);
  // Números estrangeiros tipo US/CA com 11 dígitos podem ter sido gravados como 55 + 1XXXXXXXXXX.
  if (withoutBrazilCode.length === 11 && withoutBrazilCode[2] !== "9") return withoutBrazilCode;
  if (withoutBrazilCode.length >= 12 && hasKnownForeignCountryCode(withoutBrazilCode)) return withoutBrazilCode;
  return digits;
}

function normalizeWhatsappPhone(value: unknown) {
  const raw = String(value || "").trim();
  const digits = stripAccidentalBrazilPrefix(raw.replace(/\D/g, ""));
  if (!digits) return "";
  if (raw.startsWith("+")) return digits;
  if (digits.startsWith("55")) {
    if (digits.length === 12) return `${digits.slice(0, 4)}9${digits.slice(4)}`;
    return digits;
  }
  if (hasKnownForeignCountryCode(digits)) return digits;
  if (digits.length >= 12) return digits;
  if (digits.length === 11) return digits[2] === "9" ? `55${digits}` : digits;
  if (digits.length === 10) return `55${digits}`;
  return digits;
}

function formatCrmPublicPhone(value: unknown) {
  const normalized = normalizeWhatsappPhone(value);
  if (!normalized) return "";
  // Para o endpoint público do CRM, números internacionais precisam ir com '+'.
  // Sem isso, o CRM assume Brasil e adiciona 55 indevidamente.
  return normalized.startsWith("55") ? normalized : `+${normalized}`;
}

function isForeignWhatsappPhone(value: unknown) {
  const normalized = normalizeWhatsappPhone(value);
  return !!normalized && !normalized.startsWith("55");
}

function cleanMimeType(value?: string | null, fallback = "application/octet-stream") {
  return (value || fallback).split(";")[0].trim().toLowerCase() || fallback;
}

function inferMimeFromUrl(url: string, fallback = "application/octet-stream") {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.jpe?g$/.test(clean)) return "image/jpeg";
  if (/\.png$/.test(clean)) return "image/png";
  if (/\.webp$/.test(clean)) return "image/webp";
  if (/\.gif$/.test(clean)) return "image/gif";
  if (/\.mp4$/.test(clean)) return "video/mp4";
  if (/\.pdf$/.test(clean)) return "application/pdf";
  return fallback;
}

// Cache de sessão por chave: o token mágico é de uso único e a verificação falha
// quando várias cobranças são enviadas em paralelo ("Sessão do CRM Oficial inválida").
const crmSessionCache = new Map<string, { accessToken: string; ownerId: string; expiresAt: number }>();

async function openCrmSession(key: string) {
  const embed = await crmFetch("/api/public/v1/embed-session", {
    method: "POST",
    body: JSON.stringify({ redirect: "/app/inbox" }),
    apiKey: key,
  });
  const tokenHash = (embed.body as any)?.token_hash;
  if (!embed.ok || !tokenHash) throw new Error(`Não foi possível abrir sessão do CRM Oficial (${embed.status})`);

  const verify = await fetch(`${CRM_SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CRM_SUPABASE_ANON_KEY },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await verify.json().catch(() => ({}));
  if (!verify.ok || !session?.access_token || !session?.user?.id) {
    const detail = (session as any)?.error_description || (session as any)?.msg || `HTTP ${verify.status}`;
    throw new Error(`Sessão do CRM Oficial inválida (${detail})`);
  }
  return { accessToken: String(session.access_token), ownerId: String(session.user.id) };
}

async function getCrmOwnerSession(apiKey?: string) {
  const key = (apiKey || Deno.env.get("CRM_OFICIAL_API_KEY") || "").trim();
  if (!key) throw new Error("CRM Oficial API key não configurada");

  const cached = crmSessionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { accessToken: cached.accessToken, ownerId: cached.ownerId };
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const session = await openCrmSession(key);
      crmSessionCache.set(key, { ...session, expiresAt: Date.now() + 45 * 60 * 1000 });
      return session;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  crmSessionCache.delete(key);
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}


async function crmRest(path: string, accessToken: string, init: RequestInit = {}) {
  const headers = {
    apikey: CRM_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${CRM_SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body));
  return body;
}

function randomApiToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return `zc_${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createCrmSession(email: string, password: string) {
  const response = await fetch(`${CRM_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CRM_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token || !body?.user?.id) {
    return { ok: false, status: response.status, body };
  }
  return { ok: true, status: response.status, body, accessToken: String(body.access_token), ownerId: String(body.user.id) };
}

// Escopos completos usados pelo ZapCRM na "Chave inicial (signup)".
// Chaves criadas manualmente nascem só com contatos/mensagens e falham em canais/templates.
const CRM_FULL_SCOPES = [
  "contacts:read", "contacts:write",
  "conversations:read", "conversations:write",
  "messages:read", "messages:write",
  "broadcasts:read", "broadcasts:write",
  "channels:read", "channels:write",
  "tags:read", "tags:write",
  "chatbots:read", "chatbots:write",
  "templates:read", "templates:write",
  "whatsapp-template-send:write",
  "media:read", "media:write",
  "whatsapp-media-send:write",
  "utm:read", "utm:write",
  "profile:read",
];

// Valida se a chave realmente enxerga os canais. Chaves sem escopos
// respondem 403 "Missing scope: channels:read".
async function crmKeyIsUsable(apiKey: string) {
  try {
    const res = await crmFetch("/api/public/v1/channels", { method: "GET", apiKey });
    if (res.ok) return true;
    const text = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? "");
    if (res.status === 403 || /missing scope/i.test(text)) return false;
    // Erros temporários (5xx/timeout) não invalidam a chave.
    return res.status < 500;
  } catch {
    return true;
  }
}

// Conserta a chave existente concedendo todos os escopos, sem trocar a conta do
// revendedor (o que faria ele perder canais e conversas já criados).
async function repairCrmKeyScopes(apiKey: string) {
  try {
    const { accessToken } = await openCrmSession(apiKey);
    const prefix = apiKey.slice(0, 6);
    const rows = await crmRest(`integration_api_keys?select=id,token_prefix,scopes`, accessToken) as any[];
    const target = (rows || []).find((r) => String(r?.token_prefix || "").startsWith(prefix));
    if (!target?.id) return false;
    await crmRest(`integration_api_keys?id=eq.${target.id}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({ scopes: CRM_FULL_SCOPES }),
    });
    return await crmKeyIsUsable(apiKey);
  } catch (e) {
    console.error("[crm-oficial-sync] repairCrmKeyScopes:", e);
    return false;
  }
}


async function createCrmIntegrationKey(email: string, password: string) {
  const session = await createCrmSession(email, password);
  if (!session.ok || !session.accessToken || !session.ownerId) return session;

  const rawToken = randomApiToken();
  const tokenHash = await sha256Hex(rawToken);
  const response = await fetch(`${CRM_SUPABASE_URL}/rest/v1/integration_api_keys?select=id,name,token_prefix,scopes`, {
    method: "POST",
    headers: {
      apikey: CRM_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      owner_id: session.ownerId,
      name: "SuperGestor",
      token_hash: tokenHash,
      token_prefix: rawToken.slice(0, 6),
      scopes: CRM_FULL_SCOPES,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, body };
  // Sem escopos válidos a chave é inútil: devolve erro para cair no provisionamento gerenciado.
  if (!(await crmKeyIsUsable(rawToken))) {
    return { ok: false, status: 403, body: { error: "Chave criada sem escopos (Missing scope)" } };
  }
  return { ok: true, status: response.status, body, apiKey: rawToken };
}


function extractSignupApiKey(body: any) {
  const candidates = [body?.api_key, body?.apiKey, body?.token, body?.data?.api_key, body?.data?.apiKey];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function managedCrmEmail(localUserId: string) {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `crm-${localUserId.slice(0, 8)}-${suffix}@supergestor.top`;
}

function managedCrmPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `Sg!${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function provisionManagedCrmKey(localUserId: string, fullName?: string) {
  const signup = await doSignup({
    email: managedCrmEmail(localUserId),
    password: managedCrmPassword(),
    full_name: fullName || "Revendedor SuperGestor",
  });
  const apiKey = extractSignupApiKey((signup as any)?.body);
  if (!signup.ok || !apiKey) {
    return { ok: false, status: signup.status, body: signup.body };
  }
  const saved = await persistLocalCrmKey(localUserId, apiKey);
  return { ok: saved.ok, saved: saved.ok, save_error: saved.ok ? undefined : saved.error };
}

async function getAuthorizedLocalUserId(req: Request, requestedUserId?: string) {
  const userId = String(requestedUserId || "").trim();
  if (!userId) return "";
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const supaUrl = Deno.env.get("SUPABASE_URL") || "";
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!jwt || !supaUrl || !svc) return "";
  if (jwt === svc) return userId;
  const authed = createClient(supaUrl, svc);
  const { data } = await authed.auth.getUser(jwt);
  const callerId = data?.user?.id;
  if (!callerId) return "";
  if (callerId === userId) return userId;
  // Admin pode provisionar a chave de outro revendedor
  const { data: adminRole } = await authed
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();
  return adminRole ? userId : "";
}

async function persistLocalCrmKey(userId: string, apiKey: string) {
  const supaUrl = Deno.env.get("SUPABASE_URL") || "";
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supaUrl || !svc || !userId || !apiKey) return { ok: false, error: "backend indisponível" };
  const admin = createClient(supaUrl, svc);
  
  // Garantir que a integração_api_key do ZapCRM seja provisionada para o novo revendedor
  // para que o iframe funcione sem pedir login
  try {
    await signupManagedCrmUser(userId, apiKey);
  } catch (e) {
    console.error("[crm-oficial-sync] erro ao sincronizar provisionamento crm:", e);
  }

  const { error } = await admin
    .from("crm_oficial_settings")
    .upsert({ user_id: userId, api_key: apiKey, enabled: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function signupManagedCrmUser(userId: string, apiKey: string) {
  // Chamada interna para o ZapCRM para vincular o token e criar a sessão
  const res = await crmFetch("/api/public/v1/provision-managed", {
    method: "POST",
    body: JSON.stringify({ userId, apiKey }),
  });
  return res;
}

// Completa os canais oficiais com o número real (display_phone_number) direto da Meta.
// O CRM às vezes devolve o canal sem o número ("Confirmando número...").
async function enrichChannelsWithMetaNumbers(listed: any, apiKey?: string) {
  try {
    if (!listed?.ok) return listed;
    const body = listed.body;
    const arr: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.channels)
        ? body.channels
        : Array.isArray(body?.whatsapp)
          ? body.whatsapp
          : Array.isArray(body?.data)
            ? body.data
            : [];

    const { accessToken } = await getCrmOwnerSession(apiKey);
    // Busca TODOS os canais internos: números em coexistência podem estar
    // gravados com outro "kind" (ex.: whatsapp_coexistence) mas continuam
    // sendo oficiais da Meta porque possuem phone_number_id.
    const allRows = await crmRest(`channels?select=*`, accessToken) as any[];
    const rows = (allRows || []).filter((r: any) => !!(r?.phone_number_id || r?.phoneNumberId));

    const digits = (v: unknown) => String(v || "").replace(/\D/g, "");
    const sameNumber = (a: unknown, b: unknown) => {
      const x = digits(a), y = digits(b);
      if (x.length < 10 || y.length < 10) return false;
      return x === y || x.endsWith(y.slice(-10)) || y.endsWith(x.slice(-10));
    };

    // A rota pública do CRM pode omitir o canal Cloud e devolver apenas a
    // instância QR ligada ao mesmo telefone. Recoloca os canais oficiais da
    // fonte interna antes de o frontend classificar e remover duplicidades.
    const listedOfficialIds = new Set(
      arr
        .map((c) => c?.phone_number_id || c?.phoneNumberId)
        .filter(Boolean)
        .map(String),
    );
    for (const row of rows || []) {
      const phoneId = String(row?.phone_number_id || row?.phoneNumberId);
      if (!phoneId || listedOfficialIds.has(phoneId)) continue;

      const rowPhone = row?.display_phone_number || row?.phone_number;
      // Se o mesmo número já veio na listagem pública (como QR/Evolution),
      // promove aquele registro a oficial em vez de duplicar o cartão.
      const existing = arr.find((c) =>
        sameNumber(c?.display_phone_number || c?.phone_number || c?.phone, rowPhone) ||
        String(c?.name || "").trim().toLowerCase() === String(row?.name || "").trim().toLowerCase(),
      );
      if (existing) {
        existing.kind = "whatsapp_cloud";
        existing.type = "whatsapp_cloud";
        existing.phone_number_id = phoneId;
        existing.waba_id = row?.waba_id ?? existing.waba_id;
        existing.verified_name = row?.verified_name || existing.verified_name;
        existing.display_phone_number = rowPhone || existing.display_phone_number;
        existing.quality_rating = row?.quality_rating || existing.quality_rating;
        delete existing.evolution_instance_name;
        delete existing.evolution_status;
        listedOfficialIds.add(phoneId);
        continue;
      }

      arr.push({
        id: row?.id || phoneId,
        kind: "whatsapp_cloud",
        name: row?.name,
        verified_name: row?.verified_name,
        display_phone_number: row?.display_phone_number,
        phone_number: row?.phone_number,
        phone_number_id: phoneId,
        waba_id: row?.waba_id,
        quality_rating: row?.quality_rating,
        avatar_url: row?.avatar_url,
        is_active: row?.is_active,
        primary: row?.primary,
        is_primary: row?.is_primary,
      });
      listedOfficialIds.add(phoneId);
    }


    if (!arr.length) return listed;

    const official = arr.filter((c) => {
      const kind = String(c?.kind || c?.type || "").toLowerCase();
      return !!(c?.phone_number_id || c?.phoneNumberId) && !kind.includes("evolution") && !kind.includes("baileys");
    });
    const tokenByPhoneId = new Map<string, string>();
    for (const r of rows || []) {
      if (r?.phone_number_id && r?.system_user_token) {
        tokenByPhoneId.set(String(r.phone_number_id), String(r.system_user_token));
      }
    }
    const fallbackToken = rows?.find((r: any) => r?.system_user_token)?.system_user_token;

    await Promise.all(
      official.map(async (c) => {
        const pid = String(c.phone_number_id || c.phoneNumberId);
        const token = tokenByPhoneId.get(pid) || fallbackToken;
        if (!token) return;
        try {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${pid}?fields=display_phone_number,verified_name,quality_rating`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const meta = await res.json().catch(() => ({}));
          if (!res.ok) return;
          if (meta?.display_phone_number) c.display_phone_number = meta.display_phone_number;
          if (meta?.verified_name && !c.verified_name) c.verified_name = meta.verified_name;
          if (meta?.quality_rating && !c.quality_rating) c.quality_rating = meta.quality_rating;
        } catch (_e) { /* ignora falha de enriquecimento */ }
      }),
    );

    return listed;
  } catch (e) {
    console.error("[crm-oficial-sync] enrich channels:", e);
    return listed;
  }
}

async function directMetaMediaSend(args: {

  apiKey?: string;
  phone: string;
  name?: unknown;
  body?: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "audio" | "document" | "sticker";
  mimeType?: unknown;
  fileName?: string;
  channelId?: unknown;
  phoneNumberId?: unknown;
}) {
  const { accessToken, ownerId } = await getCrmOwnerSession(args.apiKey);
  const selectorPhone = args.phoneNumberId ? String(args.phoneNumberId) : "";
  const selectorChannel = args.channelId ? String(args.channelId) : "";

  let channels = await crmRest(
    `channels?select=id,phone_number_id,system_user_token,waba_id,is_active,created_at&is_active=eq.true&order=created_at.desc`,
    accessToken,
  ) as any[];
  if (selectorPhone) channels = channels.filter((c) => String(c.phone_number_id) === selectorPhone);
  if (selectorChannel) channels = channels.filter((c) => String(c.id) === selectorChannel || String(c.phone_number_id) === selectorChannel);

  let creds = channels.find((c) => c?.phone_number_id && c?.system_user_token);
  if (!creds) {
    const legacy = await crmRest(`whatsapp_settings?select=phone_number_id,system_user_token,waba_id&limit=1`, accessToken) as any[];
    creds = legacy.find((c) => c?.phone_number_id && c?.system_user_token && (!selectorPhone || String(c.phone_number_id) === selectorPhone));
  }
  if (!creds?.phone_number_id || !creds?.system_user_token) throw new Error("Canal WhatsApp Oficial não configurado no CRM");

  const mediaResponse = await fetch(args.mediaUrl);
  if (!mediaResponse.ok) throw new Error(`Não consegui baixar a imagem configurada (${mediaResponse.status})`);
  const contentType = cleanMimeType(String(args.mimeType || mediaResponse.headers.get("content-type") || inferMimeFromUrl(args.mediaUrl)));
  const fileName = args.fileName || args.mediaUrl.split("?")[0].split("/").pop() || `media-${Date.now()}`;
  const bytes = await mediaResponse.arrayBuffer();

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", contentType);
  form.append("file", new Blob([bytes], { type: contentType }), fileName);
  const upload = await fetch(`https://graph.facebook.com/v21.0/${creds.phone_number_id}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.system_user_token}` },
    body: form,
  });
  const uploadJson = await upload.json().catch(() => ({}));
  if (!upload.ok || !uploadJson?.id) throw new Error(uploadJson?.error?.message || `Upload mídia Meta HTTP ${upload.status}`);

  const to = normalizeWhatsappPhone(args.phone);
  const type = args.mediaType === "sticker" ? "image" : args.mediaType;
  const mediaNode: Record<string, unknown> = { id: uploadJson.id };
  if (type !== "audio" && args.body) mediaNode.caption = args.body;
  if (type === "document") mediaNode.filename = fileName;
  const payload = { messaging_product: "whatsapp", to, type, [type]: mediaNode };
  const send = await fetch(`https://graph.facebook.com/v21.0/${creds.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.system_user_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const graph = await send.json().catch(() => ({}));
  if (!send.ok) throw new Error(graph?.error?.message || `Meta send HTTP ${send.status}`);

  // Persistência best-effort no inbox do CRM Oficial para aparecer igual ao chat oficial.
  try {
    const contactRows = await crmRest(`contacts?select=id,name,phone&phone=eq.${encodeURIComponent(to)}&limit=1`, accessToken) as any[];
    let contact = contactRows?.[0];
    if (!contact) {
      const created = await crmRest(`contacts?select=id,name,phone`, accessToken, {
        method: "POST",
        body: JSON.stringify({ owner_id: ownerId, phone: to, name: String(args.name || to), stage: "new" }),
      }) as any[];
      contact = created?.[0];
    }
    if (contact?.id) {
      let convRows = await crmRest(`conversations?select=id,unread_count&contact_id=eq.${contact.id}&phone_number_id=eq.${encodeURIComponent(String(creds.phone_number_id))}&limit=1`, accessToken) as any[];
      let conv = convRows?.[0];
      if (!conv) {
        const createdConv = await crmRest(`conversations?select=id,unread_count`, accessToken, {
          method: "POST",
          body: JSON.stringify({ owner_id: ownerId, contact_id: contact.id, channel: "whatsapp", channel_id: creds.id ?? null, phone_number_id: creds.phone_number_id, status: "open" }),
        }) as any[];
        conv = createdConv?.[0];
      }
      if (conv?.id) {
        const now = new Date().toISOString();
        await crmRest(`messages`, accessToken, {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conv.id,
            owner_id: ownerId,
            direction: "out",
            body: args.body || `[${type}] ${fileName}`,
            status: graph?.messages?.[0]?.message_status || "accepted",
            wa_message_id: graph?.messages?.[0]?.id ?? null,
            media_type: type,
            media_url: args.mediaUrl,
            mime_type: contentType,
            file_name: fileName,
            phone_number_id: creds.phone_number_id,
          }),
        });
        await crmRest(`conversations?id=eq.${conv.id}`, accessToken, {
          method: "PATCH",
          body: JSON.stringify({ last_message: args.body || `[${type}] ${fileName}`, last_message_at: now, unread_count: 0, status: "open", phone_number_id: creds.phone_number_id }),
        });
      }
    }
  } catch (persistError) {
    console.warn("[crm-oficial-sync] mídia enviada, mas não persistiu no inbox:", persistError instanceof Error ? persistError.message : persistError);
  }

  return { ok: true, status: 200, body: { ok: true, whatsapp: graph, direct_meta_media: true, phone_number_id: creds.phone_number_id } };
}

async function directMetaTemplateSend(args: {
  apiKey?: string;
  phone: string;
  name?: unknown;
  templateName: string;
  language: string;
  components?: unknown[];
  channelId?: unknown;
  phoneNumberId?: unknown;
}) {
  const { accessToken, ownerId } = await getCrmOwnerSession(args.apiKey);
  const selectorPhone = args.phoneNumberId ? String(args.phoneNumberId) : "";
  const selectorChannel = args.channelId ? String(args.channelId) : "";

  let channels = await crmRest(
    `channels?select=id,phone_number_id,system_user_token,waba_id,is_active,created_at&is_active=eq.true&order=created_at.desc`,
    accessToken,
  ) as any[];
  if (selectorPhone) channels = channels.filter((c) => String(c.phone_number_id) === selectorPhone);
  if (selectorChannel) channels = channels.filter((c) => String(c.id) === selectorChannel || String(c.phone_number_id) === selectorChannel);

  let creds = channels.find((c) => c?.phone_number_id && c?.system_user_token);
  if (!creds) {
    const legacy = await crmRest(`whatsapp_settings?select=phone_number_id,system_user_token,waba_id&limit=1`, accessToken) as any[];
    creds = legacy.find((c) => c?.phone_number_id && c?.system_user_token && (!selectorPhone || String(c.phone_number_id) === selectorPhone));
  }
  if (!creds?.phone_number_id || !creds?.system_user_token) throw new Error("Canal WhatsApp Oficial não configurado no CRM");

  const to = normalizeWhatsappPhone(args.phone);
  const template: Record<string, unknown> = {
    name: args.templateName,
    language: { code: args.language, policy: "deterministic" },
  };
  if (Array.isArray(args.components) && args.components.length) template.components = args.components;

  const payload = { messaging_product: "whatsapp", to, type: "template", template };
  const send = await fetch(`https://graph.facebook.com/v21.0/${creds.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.system_user_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const graph = await send.json().catch(() => ({}));
  if (!send.ok) throw new Error(graph?.error?.message || `Meta template HTTP ${send.status}`);

  try {
    const contactRows = await crmRest(`contacts?select=id,name,phone&phone=eq.${encodeURIComponent(to)}&limit=1`, accessToken) as any[];
    let contact = contactRows?.[0];
    if (!contact) {
      const created = await crmRest(`contacts?select=id,name,phone`, accessToken, {
        method: "POST",
        body: JSON.stringify({ owner_id: ownerId, phone: to, name: String(args.name || to), stage: "new" }),
      }) as any[];
      contact = created?.[0];
    }
    if (contact?.id) {
      let convRows = await crmRest(`conversations?select=id,unread_count&contact_id=eq.${contact.id}&phone_number_id=eq.${encodeURIComponent(String(creds.phone_number_id))}&limit=1`, accessToken) as any[];
      let conv = convRows?.[0];
      if (!conv) {
        const createdConv = await crmRest(`conversations?select=id,unread_count`, accessToken, {
          method: "POST",
          body: JSON.stringify({ owner_id: ownerId, contact_id: contact.id, channel: "whatsapp", channel_id: creds.id ?? null, phone_number_id: creds.phone_number_id, status: "open" }),
        }) as any[];
        conv = createdConv?.[0];
      }
      if (conv?.id) {
        const body = `[Template: ${args.templateName}]`;
        const now = new Date().toISOString();
        await crmRest(`messages`, accessToken, {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conv.id,
            owner_id: ownerId,
            direction: "out",
            body,
            status: graph?.messages?.[0]?.message_status || "accepted",
            wa_message_id: graph?.messages?.[0]?.id ?? null,
            phone_number_id: creds.phone_number_id,
          }),
        });
        await crmRest(`conversations?id=eq.${conv.id}`, accessToken, {
          method: "PATCH",
          body: JSON.stringify({ last_message: body, last_message_at: now, unread_count: 0, status: "open", phone_number_id: creds.phone_number_id }),
        });
      }
    }
  } catch (persistError) {
    console.warn("[crm-oficial-sync] template enviado, mas não persistiu no inbox:", persistError instanceof Error ? persistError.message : persistError);
  }

  return { ok: true, status: 200, body: { ok: true, whatsapp: graph, direct_meta_template: true, phone_number_id: creds.phone_number_id, to } };
}

function textFromUnknown(value: unknown) {
  return value == null ? "" : String(value);
}

function cleanErrorPreview(value: unknown, max = 500) {
  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  return text
    .replace(/<!DOCTYPE[\s\S]*$/i, "Resposta HTML do endpoint")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function imageHeaderFromComponents(components: unknown[]) {
  for (const component of components) {
    const c = component as { type?: string; parameters?: Array<{ type?: string; image?: { link?: string; url?: string } }> };
    if (String(c?.type || "").toLowerCase() !== "header") continue;
    const image = c.parameters?.find((p) => String(p?.type || "").toLowerCase() === "image")?.image;
    const link = image?.link || image?.url;
    if (link) return link;
  }
  return undefined;
}

function normalizeListTemplatesBody(body: unknown): any[] {
  const value = body as any;
  return Array.isArray(value)
    ? value
    : Array.isArray(value?.templates)
      ? value.templates
      : Array.isArray(value?.data)
        ? value.data
        : Array.isArray(value?.items)
          ? value.items
          : [];
}

function extractOfficialTemplateHeaderImage(template: any): string | undefined {
  const components = Array.isArray(template?.components) ? template.components : [];
  const header = components.find((component: any) =>
    String(component?.type || "").toUpperCase() === "HEADER" &&
    String(component?.format || "").toUpperCase() === "IMAGE"
  );
  return header?.example?.header_handle?.[0] || header?.example?.header_url?.[0] || undefined;
}

function isMetaTemplateMediaUrl(url?: string) {
  return !!url && /scontent\.whatsapp\.net|lookaside\.fbsbx\.com/i.test(url);
}

async function fetchOfficialTemplateHeaderImage(templateName: string, language: string, apiKey?: string) {
  const result = await crmFetchWithKeyFallback("/api/public/v1/templates?limit=250", { method: "GET" }, apiKey);
  const templates = normalizeListTemplatesBody(result.body);
  const matches = templates.filter((template: any) => {
    const name = String(template?.name || template?.template_name || "");
    if (name !== templateName) return false;
    const lang = String(template?.language || template?.language_code || template?.lang || "");
    return !lang || !language || lang === language;
  });
  const selected = matches.find((template: any) => String(template?.status || "").toUpperCase() === "APPROVED") || matches[0];
  return extractOfficialTemplateHeaderImage(selected);
}

// Busca a definição do template diretamente na Graph API (filtrando por nome),
// usado quando a listagem do CRM falha (ex.: rate limit #80008).
async function fetchTemplateFromGraph(templateName: string, apiKey?: string, phoneNumberId?: string): Promise<any[]> {
  try {
    const { accessToken } = await getCrmOwnerSession(apiKey);
    const channelRows = await crmRest(
      `channels?select=phone_number_id,system_user_token,waba_id,is_active,created_at&is_active=eq.true&order=created_at.desc`,
      accessToken,
    ) as any[];
    let legacyRows: any[] = [];
    try {
      legacyRows = await crmRest(`whatsapp_settings?select=phone_number_id,system_user_token,waba_id&limit=10`, accessToken) as any[];
    } catch { /* configuração antiga é opcional */ }
    const requestedPhoneId = String(phoneNumberId || "");
    const credentials = [...channelRows, ...legacyRows]
      .filter((c) => c?.waba_id && c?.system_user_token)
      .sort((a, b) => Number(String(b?.phone_number_id || "") === requestedPhoneId) - Number(String(a?.phone_number_id || "") === requestedPhoneId));
    const seen = new Set<string>();
    const matches: any[] = [];
    for (const creds of credentials) {
      const key = `${creds.waba_id}:${creds.system_user_token}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${creds.waba_id}/message_templates?fields=id,name,status,language,category,components,parameter_format&name=${encodeURIComponent(templateName)}&limit=50`,
        { headers: { Authorization: `Bearer ${creds.system_user_token}` } },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(json?.data)) continue;
      matches.push(...json.data.filter((t: any) => String(t?.name || "") === templateName));
      if (requestedPhoneId && String(creds.phone_number_id || "") === requestedPhoneId && matches.length) break;
    }
    return matches;
  } catch { return []; }
}

// Cache local de definições de templates: a Meta bloqueia a listagem com (#80008)
// quando há muitas chamadas, e sem a definição o idioma cai no default pt_BR e o
// envio falha com 132001. Guardamos a última definição conhecida no banco.

function templateCacheClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function readTemplateCache(templateName: string, language: string): Promise<any | null> {
  try {
    const db = templateCacheClient();
    if (!db) return null;
    let q = db.from("meta_template_cache").select("language, definition").eq("name", templateName);
    if (language) q = q.eq("language", language);
    const { data } = await q.order("updated_at", { ascending: false }).limit(1);
    const row = (data as any[] | null)?.[0];
    if (row?.definition) return row.definition;
    if (language) {
      const { data: any2 } = await db.from("meta_template_cache").select("definition")
        .eq("name", templateName).order("updated_at", { ascending: false }).limit(1);
      return (any2 as any[] | null)?.[0]?.definition || null;
    }
    return null;
  } catch { return null; }
}

async function writeTemplateCache(templateName: string, definition: any) {
  try {
    const db = templateCacheClient();
    if (!db || !definition) return;
    const lang = String(definition?.language || definition?.language_code || definition?.lang || "");
    if (!lang) return;
    await db.from("meta_template_cache").upsert(
      { name: templateName, language: lang, definition, updated_at: new Date().toISOString() },
      { onConflict: "name,language" },
    );
  } catch { /* best effort */ }
}

// Returns the full template definition (components + parameter_format) so we
// can build correct body params (positional vs named) for sendTemplate.
async function fetchOfficialTemplate(templateName: string, language: string, apiKey?: string, phoneNumberId?: string): Promise<any | null> {
  const pick = async (matches: any[]) => {
    if (!matches.length) return null;
    for (const m of matches) await writeTemplateCache(templateName, m);
    const norm = (l: unknown) => String(l || "").toLowerCase().replace(/-/g, "_");
    const langOf = (t: any) => norm(t?.language || t?.language_code || t?.lang);
    const approved = matches.filter((t: any) => String(t?.status || "").toUpperCase() === "APPROVED");
    const pool = approved.length ? approved : matches;
    const exact = language ? pool.find((t: any) => langOf(t) === norm(language)) : null;
    return exact || pool[0];
  };


  // A Graph API da Meta é a fonte da verdade do idioma/estrutura do template.
  // A listagem do CRM às vezes devolve metadados de idioma errados (ex.: "en"),
  // por isso ela é apenas fallback.
  let matches: any[] = await fetchTemplateFromGraph(templateName, apiKey, phoneNumberId);

  if (!matches.length) {
    try {
      const result = await crmFetchWithKeyFallback("/api/public/v1/templates?limit=250", { method: "GET" }, apiKey);
      const templates = normalizeListTemplatesBody(result.body);
      matches = templates.filter((t: any) => String(t?.name || t?.template_name || "") === templateName);
    } catch { /* segue para fallbacks */ }
  }

  if (!matches.length) return await readTemplateCache(templateName, language);
  return await pick(matches);

}



function getTemplateBodyParamNames(template: any): string[] {
  const components = Array.isArray(template?.components) ? template.components : [];
  const body = components.find((c: any) => String(c?.type || "").toUpperCase() === "BODY");
  if (!body) return [];
  const text = String(body?.text || "");
  const namedTextMatches = Array.from(text.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)).map((m) => m[1]);
  if (namedTextMatches.length) return Array.from(new Set(namedTextMatches));
  const named: any[] = body?.example?.body_text_named_params || [];
  if (Array.isArray(named) && named.length) return named.map((p: any) => String(p?.param_name || p?.parameter_name || ""));
  // Positional fallback: count {{N}} placeholders.
  const placeholders = text.match(/\{\{\s*\d+\s*\}\}/g) || [];
  const distinct = new Set(placeholders.map((m) => m.replace(/\D/g, "")));
  return Array.from(distinct).map(() => "");
}



function replaceHeaderImageInComponents(components: unknown[], publicUrl?: string) {
  if (!publicUrl) return components;
  let replaced = false;
  return components.map((component) => {
    const c = component as { type?: string; parameters?: Array<Record<string, unknown>> };
    if (String(c?.type || "").toLowerCase() !== "header" || !Array.isArray(c?.parameters)) return component;

    replaced = true;
    return {
      ...c,
      parameters: c.parameters.map((parameter) => {
        if (String(parameter?.type || "").toLowerCase() !== "image") return parameter;
        return { ...parameter, image: { link: publicUrl } };
      }),
    };
  }).concat(replaced ? [] : [{ type: "header", parameters: [{ type: "image", image: { link: publicUrl } }] }]);
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function ensurePublicMediaUrl(url: string, label = "media") {
  if (!/scontent\.whatsapp\.net|lookaside\.fbsbx\.com/i.test(url)) return url;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  // Meta accepts its own CDN URLs for short-lived sends; fall back to the
  // original URL whenever we can't (or fail to) rehost it.
  if (!supabaseUrl || !serviceKey) return url;

  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const bytes = new Uint8Array(await response.arrayBuffer());
    const admin = createClient(supabaseUrl, serviceKey);
    const path = `crm-oficial-template-headers/${Date.now()}-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;
    // Retry up to 3x on transient storage errors (Service Unavailable etc).
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await admin.storage.from("reseller-assets").upload(path, bytes, { contentType, upsert: true });
      if (!error) {
        const { data } = admin.storage.from("reseller-assets").getPublicUrl(path);
        if (data?.publicUrl) return data.publicUrl;
        break;
      }
      lastErr = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    console.warn("[ensurePublicMediaUrl] storage upload failed, falling back to CDN URL", lastErr?.message || lastErr);
    return url;
  } catch (e) {
    console.warn("[ensurePublicMediaUrl] exception, falling back to CDN URL", (e as Error).message);
    return url;
  }
}

function hasMissingTemplateScope(result: { status: number; body: unknown }) {
  const results = [result, ...(((result as { attempts?: Array<{ status: number; body: unknown }> }).attempts) || [])];
  return results.some((item) => {
    const body = typeof item.body === "string" ? item.body : JSON.stringify(item.body || {});
    return item.status === 403 && body.includes("whatsapp-template-send:write");
  });
}

function missingTemplateScopeResult(result: { ok: boolean; status: number; body: unknown }) {
  const results = [result, ...(((result as { attempts?: Array<{ ok?: boolean; status: number; body: unknown }> }).attempts) || [])];
  return results.find((item) => {
    const body = typeof item.body === "string" ? item.body : JSON.stringify(item.body || {});
    return item.status === 403 && body.includes("whatsapp-template-send:write");
  });
}

async function doSignup(payload: { email: string; password: string; full_name?: string }, apiKey?: string) {
  return crmFetch("/api/public/v1/signup", {
    method: "POST",
    withAuth: false,
    body: JSON.stringify(payload),
    apiKey,
  });
}

async function doContact(payload: { name: string; phone: string; email?: string; stage?: string; notes?: string }, apiKey?: string) {
  return crmFetch("/api/public/v1/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
    apiKey,
  });
}

async function doMessage(payload: { phone: string; name?: string; body: string; direction?: "in" | "out" }, apiKey?: string) {
  return crmFetch("/api/public/v1/messages", {
    method: "POST",
    body: JSON.stringify({ direction: "in", ...payload }),
    apiKey,
  });
}

async function doPing(apiKey?: string) {
  return crmFetch("/api/public/v1/contacts?limit=1", { method: "GET", apiKey });
}

async function doListConversations(apiKey?: string) {
  return crmFetch("/api/public/v1/conversations", { method: "GET", apiKey });
}

async function doListMessages(conversation_id: string, apiKey?: string) {
  return crmFetch(`/api/public/v1/messages?conversation_id=${encodeURIComponent(conversation_id)}`, { method: "GET", apiKey });
}

async function doSendWhatsapp(payload: {
  phone: string;
  body?: string;
  name?: string;
  channel_id?: string;
  phone_number_id?: string;
  from_phone_number_id?: string;
  media_url?: string;
  mediaUrl?: string;
  media_id?: string;
  mediaId?: string;
  media_type?: string;
  mediaType?: string;
  mime_type?: string;
  mimetype?: string;
  caption?: string;
  file_name?: string;
  fileName?: string;
  template_name?: string;
  template_language?: string;
  language?: string;
  template_params?: unknown[];
  components?: unknown[];
  require_media?: boolean;
}, apiKey?: string) {
  const crmPhone = formatCrmPublicPhone(payload.phone);
  const final: Record<string, unknown> = { ...payload, phone: crmPhone, to: crmPhone };
  if (payload.media_url && !final.mediaUrl) final.mediaUrl = payload.media_url;
  if (payload.media_id && !final.mediaId) final.mediaId = payload.media_id;
  if (payload.media_type && !final.mediaType) final.mediaType = payload.media_type;
  if (payload.file_name && !final.fileName) final.fileName = payload.file_name;
  if (payload.mime_type && !final.mimetype) final.mimetype = payload.mime_type;
  if (payload.caption && !payload.body) final.body = payload.caption;

  // Template oficial: usar endpoint /whatsapp-template-send se houver template_name.
  if (payload.template_name) {
    const recipientPhone = formatCrmPublicPhone(payload.phone);
    const requestedLang = payload.template_language || payload.language || "pt_BR";
    const params = Array.isArray(payload.template_params) ? payload.template_params : [];
    const fallbackBody = textFromUnknown(payload.body).trim() || params.map(textFromUnknown).filter(Boolean).join(" ");
    // Try the requested language first; if the template doesn't exist in that locale,
    // fall back to whatever locale actually exists (fetchOfficialTemplate returns matches[0]).
    // Then use the *actual* language of the resolved template on the wire, so Meta doesn't
    // reject with 132001 "template name does not exist in <lang>".
    let officialTemplate = await fetchOfficialTemplate(String(payload.template_name), String(requestedLang), apiKey, payload.phone_number_id || payload.from_phone_number_id).catch(() => null);
    if (!officialTemplate) {
      officialTemplate = await fetchOfficialTemplate(String(payload.template_name), "", apiKey, payload.phone_number_id || payload.from_phone_number_id).catch(() => null);
    }
    const resolvedLang = String(
      officialTemplate?.language || officialTemplate?.language_code || officialTemplate?.lang || requestedLang
    );
    // Respeita EXATAMENTE o idioma com que o template foi aprovado na Meta
    // (a definição vem da Graph API). O idioma pedido só é usado quando não
    // conseguimos resolver a definição real do template.
    const normLang = (l: string) => String(l || "").toLowerCase().replace(/-/g, "_");
    const lang = String(resolvedLang || requestedLang);


    const paramNames = officialTemplate ? getTemplateBodyParamNames(officialTemplate) : [];
    const isNamed = String(officialTemplate?.parameter_format || "").toUpperCase() === "NAMED"
      || (paramNames.length > 0 && paramNames.every((n) => n));
    const inferredBodyParameters = paramNames.length
      ? paramNames.map((name, i) => isNamed && name
        ? { type: "text", parameter_name: name, text: String(params[i] ?? "Cliente") }
        : { type: "text", text: String(params[i] ?? "Cliente") })
      : params.map((p) => ({ type: "text", text: String(p) }));
    const components = Array.isArray(payload.components) && payload.components.length
      ? payload.components
      : (inferredBodyParameters.length ? [{ type: "body", parameters: inferredBodyParameters }] : []);
    const officialHeaderImageUrl = extractOfficialTemplateHeaderImage(officialTemplate)
      || await fetchOfficialTemplateHeaderImage(String(payload.template_name), String(lang), apiKey).catch(() => undefined);
    const requestHeaderImageUrl = imageHeaderFromComponents(components);
    const rawHeaderImageUrl = officialHeaderImageUrl || (isMetaTemplateMediaUrl(requestHeaderImageUrl) ? requestHeaderImageUrl : undefined);
    if (requestHeaderImageUrl && !rawHeaderImageUrl) {
      throw new Error("Template com imagem recebeu uma URL que não é a mídia oficial do Meta. Sincronize o template oficial antes de enviar.");
    }
    const headerImageUrl = rawHeaderImageUrl ? await ensurePublicMediaUrl(rawHeaderImageUrl, String(payload.template_name)) : undefined;
    const templateComponents = replaceHeaderImageInComponents(components, headerImageUrl);
    if (isForeignWhatsappPhone(payload.phone)) {
      try {
        const directResult = await directMetaTemplateSend({
          apiKey,
          phone: payload.phone,
          name: payload.name,
          templateName: String(payload.template_name),
          language: String(lang),
          components: templateComponents,
          channelId: payload.channel_id,
          phoneNumberId: payload.phone_number_id || payload.from_phone_number_id,
        });
        console.log("[crm-oficial-sync] direct foreign template send", {
          template: payload.template_name,
          lang,
          to: normalizeWhatsappPhone(payload.phone),
          ok: true,
          status: directResult.status,
        });
        return directResult;
      } catch (directError) {
        const message = directError instanceof Error ? directError.message : String(directError);
        console.error("[crm-oficial-sync] direct foreign template falhou:", message);
        return { ok: false, status: 502, body: { error: message, direct_meta_template: true, blocked_wrong_country_prefix_fallback: true } };
      }
    }
    const officialPayload: Record<string, unknown> = {
      phone: recipientPhone,
      to: recipientPhone,
      name: payload.name,
      channel_id: payload.channel_id,
      channelId: payload.channel_id,
      phone_number_id: payload.phone_number_id || payload.from_phone_number_id,
      phoneNumberId: payload.phone_number_id || payload.from_phone_number_id,
      from_phone_number_id: payload.from_phone_number_id || payload.phone_number_id,
      template_name: payload.template_name,
      templateName: payload.template_name,
      template_language: lang,
      templateLanguage: lang,
      language: lang,
      parameter_format: isNamed ? "NAMED" : "POSITIONAL",
      ...(fallbackBody ? { body: fallbackBody } : {}),
      ...(templateComponents.length ? { components: templateComponents } : {}),
      ...(params.length ? { template_params: params, templateParams: params, parameters: params } : {}),
      ...(headerImageUrl ? { header_image_url: headerImageUrl, headerImageUrl } : {}),
    };
    const legacyPayload: Record<string, unknown> = {
      phone: recipientPhone,
      to: recipientPhone,
      name: payload.name,
      channel_id: payload.channel_id,
      channelId: payload.channel_id,
      phone_number_id: payload.phone_number_id || payload.from_phone_number_id,
      phoneNumberId: payload.phone_number_id || payload.from_phone_number_id,
      from_phone_number_id: payload.from_phone_number_id || payload.phone_number_id,
      body: fallbackBody || payload.template_name,
      template_name: payload.template_name,
      templateName: payload.template_name,
      template_language: lang,
      templateLanguage: lang,
      language: lang,
      parameter_format: isNamed ? "NAMED" : "POSITIONAL",
      template_params: params,
      templateParams: params,
      components: templateComponents,
      ...(headerImageUrl ? { header_image_url: headerImageUrl, headerImageUrl } : {}),
      template: { name: payload.template_name, language: { code: lang, policy: "deterministic" }, components: templateComponents },
    };
    const variablePayload: Record<string, unknown> = {
      phone: recipientPhone,
      to: recipientPhone,
      name: payload.name,
      channel_id: payload.channel_id,
      channelId: payload.channel_id,
      phone_number_id: payload.phone_number_id || payload.from_phone_number_id,
      phoneNumberId: payload.phone_number_id || payload.from_phone_number_id,
      from_phone_number_id: payload.from_phone_number_id || payload.phone_number_id,
      body: fallbackBody || payload.template_name,
      template_name: payload.template_name,
      language: lang,
      parameter_format: isNamed ? "NAMED" : "POSITIONAL",
      parameters: params,
      variables: isNamed && paramNames.length
        ? Object.fromEntries(paramNames.map((name, i) => [name, textFromUnknown(params[i] ?? "Cliente")]))
        : { body_text: params.map(textFromUnknown).filter(Boolean) },
      ...(templateComponents.length ? { components: templateComponents } : {}),
      ...(headerImageUrl ? { header_image_url: headerImageUrl, headerImageUrl } : {}),
    };
    // Tenta endpoints específicos de template. NÃO faz fallback para /whatsapp-send (texto puro),
    // pois isso enviaria sem imagem/botões/formatação do template — exatamente o bug que estamos corrigindo.
    const templateAttempts: Array<() => Promise<{ ok: boolean; status: number; body: unknown }>> = [
      () => crmFetch("/api/public/v1/whatsapp-template-send", { method: "POST", body: JSON.stringify(officialPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp/message", { method: "POST", body: JSON.stringify(officialPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp-template-send", { method: "POST", body: JSON.stringify(legacyPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp-template-send", { method: "POST", body: JSON.stringify(variablePayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp/template-send", { method: "POST", body: JSON.stringify(officialPayload), apiKey }),
      () => crmFetch("/api/public/v1/templates/send", { method: "POST", body: JSON.stringify(officialPayload), apiKey }),
    ];
    const templateResult = await firstOk(templateAttempts);
    console.log("[crm-oficial-sync] template send", {
      template: payload.template_name,
      lang,
      params,
      header_source: officialHeaderImageUrl ? "official_template" : (headerImageUrl ? "meta_request_payload" : "none"),
      ok: templateResult.ok,
      status: templateResult.status,
      attempts: (templateResult as { attempts?: Array<{ status: number; body: unknown }> }).attempts?.map((a) => ({ status: a.status, body: a.body })),
    });
    if (templateResult.ok) {
      // Memoriza o locale que funcionou: assim, se a listagem da Meta estiver
      // bloqueada por rate limit (#80008), continuamos usando o idioma correto.
      await writeTemplateCache(String(payload.template_name), {
        name: payload.template_name,
        language: lang,
        components: officialTemplate?.components || null,
        parameter_format: officialTemplate?.parameter_format || null,
        status: "APPROVED",
        source: "send_success",
      });
      return templateResult;
    }

    if (hasMissingTemplateScope(templateResult)) {
      const scopeError = missingTemplateScopeResult(templateResult);
      return {
        ok: false,
        status: 403,
        body: {
          error: "CRM Oficial precisa liberar o escopo whatsapp-template-send:write para esta chave API.",
          crm_error: scopeError?.body,
        },
        attempts: (templateResult as { attempts?: unknown }).attempts,
      };
    }

    // Todos os endpoints de template falharam — devolve erro claro em vez de degradar para texto puro.
    const attemptsSummary = ((templateResult as { attempts?: Array<{ status: number; body: unknown }> }).attempts || []).map((a) => ({
      status: a.status,
      body: cleanErrorPreview(a.body),
    }));

    // Fallback: se o Meta retornou 132001 (template não existe no locale pedido),
    // tenta enviar diretamente pela Meta Graph API usando locales alternativos.
    // Isso cobre o caso em que /api/public/v1/templates?limit=250 não devolveu o
    // template (paginação/filtro) e portanto não conseguimos resolver o locale real.
    const attemptsRaw = ((templateResult as { attempts?: Array<{ status: number; body: unknown }> }).attempts || []);
    const has132001 = attemptsRaw.some((a) => {
      const s = typeof a.body === "string" ? a.body : JSON.stringify(a.body || {});
      return /132001/.test(s) || /does not exist in the translation/i.test(s);
    });
    if (has132001) {
      // Cache com idioma errado é a causa mais comum: remove antes de retentar.
      try {
        const db = templateCacheClient();
        if (db) await db.from("meta_template_cache").delete().eq("name", String(payload.template_name)).eq("language", String(lang));
      } catch { /* best effort */ }
      const tried = new Set<string>([normLang(lang)]);
      const fallbackLangs = [resolvedLang].filter((l) => {
        if (!l || tried.has(normLang(l))) return false;
        tried.add(normLang(l));

        return true;
      });

      for (const altLang of fallbackLangs) {
        // 1) Retenta pelos endpoints do CRM (caminho que já funciona) com o locale alternativo.
        const altPayload = {
          ...officialPayload,
          template_language: altLang,
          templateLanguage: altLang,
          language: altLang,
        };
        const altViaCrm = await firstOk([
          () => crmFetch("/api/public/v1/whatsapp-template-send", { method: "POST", body: JSON.stringify(altPayload), apiKey }),
          () => crmFetch("/api/public/v1/whatsapp/message", { method: "POST", body: JSON.stringify(altPayload), apiKey }),
        ]);
        if (altViaCrm.ok) {
          console.log("[crm-oficial-sync] template fallback lang OK via CRM", { template: payload.template_name, lang: altLang });
          return altViaCrm;
        }
        const altText = JSON.stringify((altViaCrm as { attempts?: unknown }).attempts || altViaCrm.body || "");
        const altIs132001 = /132001|does not exist in the translation/i.test(altText);

        // 2) Tenta direto pela Graph API (quando o CRM tem canal Cloud configurado).
        try {
          const alt = await directMetaTemplateSend({
            apiKey,
            phone: payload.phone,
            name: payload.name,
            templateName: String(payload.template_name),
            language: altLang,
            components: templateComponents,
            channelId: payload.channel_id,
            phoneNumberId: payload.phone_number_id || payload.from_phone_number_id,
          });
          console.log("[crm-oficial-sync] template fallback lang OK via Meta direto", { template: payload.template_name, lang: altLang });
          return alt;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn("[crm-oficial-sync] fallback lang", altLang, "falhou:", msg);
          // Só interrompe se o erro não for de locale E o CRM também não indicou 132001,
          // ou seja, quando o problema é o conteúdo/parâmetros e não o idioma.
          if (!/132001|does not exist/i.test(msg) && !altIs132001 && !/não configurado no CRM/i.test(msg)) break;
        }
      }
    }


    // Mostra o motivo REAL devolvido pela Meta/CRM (rate limit, template pausado,
    // idioma inexistente, canal sem token...) em vez da mensagem genérica.
    const rawAttempts = JSON.stringify(attemptsSummary || []);
    const realReason =
      /80007|80008|rate limit/i.test(rawAttempts) ? "Limite de envio da Meta atingido (rate limit). Reduza a cadência do disparo." :
      /132001|does not exist in the translation/i.test(rawAttempts) ? `Template "${payload.template_name}" não existe no idioma ${lang} na Meta.` :
      /132015|PAUSED|paused/i.test(rawAttempts) ? `Template "${payload.template_name}" está pausado/reprovado na Meta.` :
      /não configurado no CRM|phone_number_id|channel/i.test(rawAttempts) ? "Canal WhatsApp Oficial sem phone_number_id/token válido no CRM." :
      "Nenhum endpoint de template do CRM Oficial respondeu com sucesso.";

    return {
      ok: false,
      status: templateResult.status || 502,
      body: {
        error: `${realReason} (template: ${payload.template_name} · idioma: ${lang})`,
        attempts: attemptsSummary,
      },
    };


  }


  // Mídia: monta payload Meta-compatível (type + nested object com link/caption/filename).
  const mediaUrl = (final.mediaUrl as string) || (final.media_url as string) || "";
  const mediaId = (final.mediaId as string) || (final.media_id as string) || "";
  const kind = String((final.mediaType as string) || (final.media_type as string) || "").toLowerCase();
  const captionText = String((final.caption as string) || "").trim() || (final.body && String(final.body).trim() && String(final.body).trim() !== String(final.fileName || final.file_name || "").trim() ? String(final.body).trim() : "");
  const fileName = String((final.fileName as string) || (final.file_name as string) || "");

  if (mediaUrl || mediaId) {
    const resolvedKind: "image" | "video" | "audio" | "document" | "sticker" =
      (kind as any) || (/(\.jpe?g|\.png|\.gif|\.webp)$/i.test(mediaUrl) ? "image"
        : /(\.mp4|\.mov|\.webm)$/i.test(mediaUrl) ? "video"
        : /(\.mp3|\.ogg|\.opus|\.m4a|\.wav)$/i.test(mediaUrl) ? "audio"
        : "document");
    const requireMedia = final.require_media === true;

    // Caminho confiável: envia a mídia direto pela Graph API com o token do canal do CRM Oficial.
    // O endpoint público /whatsapp-send do CRM estava retornando ok:true, mas entregando só texto.
    if (mediaUrl) {
      try {
        return await directMetaMediaSend({
          apiKey,
          phone: normalizeWhatsappPhone(final.phone),
          name: final.name,
          body: captionText || String(final.body || ""),
          mediaUrl,
          mediaType: resolvedKind,
          mimeType: final.mime_type || final.mimetype,
          fileName: fileName || undefined,
          channelId: final.channel_id,
          phoneNumberId: final.phone_number_id || final.from_phone_number_id,
        });
      } catch (directError) {
        const message = directError instanceof Error ? directError.message : String(directError);
        console.error("[crm-oficial-sync] direct Meta media falhou:", message);
        if (requireMedia) return { ok: false, status: 502, body: { error: message, direct_meta_media: true } };
      }
    }

    const linkPart = mediaUrl ? { link: mediaUrl, url: mediaUrl } : { id: mediaId };
    const nested: Record<string, unknown> =
      resolvedKind === "image"  ? { image:    { ...linkPart, ...(captionText ? { caption: captionText } : {}) } } :
      resolvedKind === "video"  ? { video:    { ...linkPart, ...(captionText ? { caption: captionText } : {}) } } :
      resolvedKind === "audio"  ? { audio:    { ...linkPart } } :
      resolvedKind === "sticker"? { sticker:  { ...linkPart } } :
                                  { document: { ...linkPart, ...(fileName ? { filename: fileName } : {}), ...(captionText ? { caption: captionText } : {}) } };
    const mediaPayload: Record<string, unknown> = {
      phone: final.phone,
      to: final.phone,
      name: final.name,
      channel_id: final.channel_id,
      channelId: final.channel_id,
      phone_number_id: final.phone_number_id || final.from_phone_number_id,
      phoneNumberId: final.phone_number_id || final.from_phone_number_id,
      from_phone_number_id: final.from_phone_number_id || final.phone_number_id,
      type: resolvedKind,
      messaging_product: "whatsapp",
      // Aliases planos (compat com versões antigas do CRM):
      media_url: mediaUrl || undefined,
      mediaUrl: mediaUrl || undefined,
      media_id: mediaId || undefined,
      mediaId: mediaId || undefined,
      media_type: resolvedKind,
      mediaType: resolvedKind,
      mime_type: final.mime_type || final.mimetype,
      mimetype: final.mime_type || final.mimetype,
      file_name: fileName || undefined,
      fileName: fileName || undefined,
      caption: captionText || undefined,
      // CRM exige campo body — usa caption como body quando houver, senão espaço para não falhar validação.
      body: captionText || " ",
      ...nested,
    };
    const compactMediaPayload: Record<string, unknown> = {
      phone: final.phone,
      to: final.phone,
      name: final.name,
      channel_id: final.channel_id,
      channelId: final.channel_id,
      phone_number_id: final.phone_number_id || final.from_phone_number_id,
      phoneNumberId: final.phone_number_id || final.from_phone_number_id,
      from_phone_number_id: final.from_phone_number_id || final.phone_number_id,
      body: captionText || " ",
      caption: captionText || undefined,
      media_url: mediaUrl || undefined,
      mediaUrl: mediaUrl || undefined,
      image_url: resolvedKind === "image" ? mediaUrl || undefined : undefined,
      media_id: mediaId || undefined,
      mediaId: mediaId || undefined,
      type: resolvedKind,
      media_type: resolvedKind,
      mediaType: resolvedKind,
      mime_type: final.mime_type || final.mimetype,
      mimetype: final.mime_type || final.mimetype,
      file_name: fileName || undefined,
      fileName: fileName || undefined,
    };
    const mediaAttempts: Array<() => Promise<{ ok: boolean; status: number; body: unknown }>> = [
      // Endpoints dedicados primeiro. /whatsapp-send aceita o payload, mas em algumas versões envia só texto.
      () => crmFetch("/api/public/v1/whatsapp/media-send", { method: "POST", body: JSON.stringify(mediaPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp-media-send", { method: "POST", body: JSON.stringify(mediaPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp/send-media", { method: "POST", body: JSON.stringify(mediaPayload), apiKey }),
      () => crmFetch("/api/public/v1/media/send", { method: "POST", body: JSON.stringify(mediaPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp/media-send", { method: "POST", body: JSON.stringify(compactMediaPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp-media-send", { method: "POST", body: JSON.stringify(compactMediaPayload), apiKey }),
      () => crmFetch("/api/public/v1/whatsapp-send", { method: "POST", body: JSON.stringify(mediaPayload), apiKey }),
    ];
    const mediaResult = await firstOk(mediaAttempts);
    console.log("[crm-oficial-sync] media send", {
      kind: resolvedKind,
      hasUrl: !!mediaUrl,
      hasId: !!mediaId,
      ok: mediaResult.ok,
      status: mediaResult.status,
    });
    return mediaResult;
  }

  // Texto puro
  if (!final.body || !String(final.body).trim()) final.body = " ";
  return crmFetch("/api/public/v1/whatsapp-send", {
    method: "POST",
    body: JSON.stringify(final),
    apiKey,
  });
}

async function doListContacts(limit: number, apiKey?: string) {
  return crmFetch(`/api/public/v1/contacts?limit=${limit}`, { method: "GET", apiKey });
}

async function firstOk(calls: Array<() => Promise<{ ok: boolean; status: number; body: unknown }>>) {
  const attempts: Array<{ ok: boolean; status: number; body: unknown }> = [];
  for (const call of calls) {
    const result = await call();
    attempts.push(result);
    if (result.ok) return { ...result, attempts };
  }
  return attempts[attempts.length - 1] ? { ...attempts[attempts.length - 1], attempts } : { ok: false, status: 0, body: null, attempts };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rawBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // ── COMPAT: aceita o mesmo shape do zap-responder { action: 'sendText', number, text, user_id }
    // Resolve a api_key da revenda (crm_oficial_settings.user_id) e despacha como send-whatsapp.
    const isTextOrMediaAction = ["sendText", "enviar-mensagem", "enviar-imagem"].includes(String(rawBody?.action || ""));
    if (isTextOrMediaAction && (rawBody.number || rawBody.phone) && (rawBody.text || rawBody.body || rawBody.image_url || rawBody.media_url)) {
      const phone = String(rawBody.number || rawBody.phone || "");
      const body = String(rawBody.text || rawBody.body || "");
      const mediaUrl = (rawBody.image_url || rawBody.media_url) as string | undefined;
      const userId = (rawBody.user_id as string | undefined) || undefined;
      let resellerApiKey: string | undefined;
      if (userId) {
        try {
          const supaUrl = Deno.env.get("SUPABASE_URL")!;
          const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supa = createClient(supaUrl, svc);
          const { data: s } = await supa
            .from("crm_oficial_settings")
            .select("api_key, enabled")
            .eq("user_id", userId)
            .maybeSingle();
          if (s?.enabled && s?.api_key) resellerApiKey = s.api_key as string;
        } catch (e) {
          console.error("[crm-oficial-sync sendText] erro lookup api_key:", e);
        }
      }
      const phoneNumberId = (rawBody.phone_number_id || rawBody.phoneNumberId || rawBody.from_phone_number_id) as string | undefined;
      let sendResult = await doSendWhatsapp({
        phone,
        body,
        ...(phoneNumberId ? { phone_number_id: String(phoneNumberId), from_phone_number_id: String(phoneNumberId) } : {}),
        ...(mediaUrl ? { media_url: mediaUrl, media_type: "image", caption: body } : {}),
      }, resellerApiKey);
      let ok = (sendResult as any)?.ok === true;

      // Fallback: se enviou com imagem e falhou (403 missing scope ou similar),
      // reenvia apenas o texto para o cliente não ficar sem a mensagem.
      if (!ok && mediaUrl && body && body.trim()) {
        const status = Number((sendResult as any)?.status || 0);
        const errStr = JSON.stringify((sendResult as any)?.body || "").toLowerCase();
        const scopeIssue = status === 403 || errStr.includes("scope") || errStr.includes("media");
        const requireMedia = rawBody.require_media === true || rawBody.action === "enviar-imagem";
        if (scopeIssue && !requireMedia) {
          console.warn("[crm-oficial-sync sendText] media falhou, fallback para texto puro:", status);
          const textOnly = await doSendWhatsapp({ phone, body, ...(phoneNumberId ? { phone_number_id: String(phoneNumberId), from_phone_number_id: String(phoneNumberId) } : {}) }, resellerApiKey);
          if ((textOnly as any)?.ok === true) {
            sendResult = textOnly;
            ok = true;
            (sendResult as any).fallback = "text-only-after-media-scope-error";
          }
        }
      }

      return new Response(JSON.stringify({ success: ok, send: sendResult, provider: "crm-oficial" }), {
        status: ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    }

    // ── COMPAT: sendTemplate { number/phone, template_name, language?, user_id?, header_image_url?, parameters? }
    if ((rawBody?.action === "sendTemplate" || rawBody?.action === "enviar-template") && (rawBody.number || rawBody.phone) && rawBody.template_name) {
      const rawPhone = String(rawBody.number || rawBody.phone || "");
      const phone = formatCrmPublicPhone(rawPhone);
      const templateName = String(rawBody.template_name || "");
      const language = (rawBody.language as string) || "pt_BR";
      const userId = (rawBody.user_id as string | undefined) || undefined;
      const headerImageUrl = (rawBody.header_image_url || rawBody.image_url || rawBody.media_url) as string | undefined;
      const parameters = Array.isArray(rawBody.parameters) ? rawBody.parameters : [];
      const tplPhoneNumberId = (rawBody.phone_number_id || rawBody.phoneNumberId || rawBody.from_phone_number_id) as string | undefined;
      let resellerApiKey: string | undefined;
      if (userId) {
        try {
          const supaUrl = Deno.env.get("SUPABASE_URL")!;
          const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supa = createClient(supaUrl, svc);
          const { data: s } = await supa
            .from("crm_oficial_settings")
            .select("api_key, enabled")
            .eq("user_id", userId)
            .maybeSingle();
          if (s?.enabled && s?.api_key) resellerApiKey = s.api_key as string;
        } catch (e) {
          console.error("[crm-oficial-sync sendTemplate] erro lookup api_key:", e);
        }
      }
      // Fetch the official template so we can build the correct body component
      // (positional OR named params, depending on parameter_format).
      const officialTemplate = await fetchOfficialTemplate(templateName, language, resellerApiKey, tplPhoneNumberId);
      const paramNames = officialTemplate ? getTemplateBodyParamNames(officialTemplate) : [];
      const isNamed = String(officialTemplate?.parameter_format || "").toUpperCase() === "NAMED"
        || (paramNames.length > 0 && paramNames.every((n) => n));

      let finalParams = parameters.slice();
      while (finalParams.length < paramNames.length) finalParams.push("Cliente");

      // Build body component explicitly so doSendWhatsapp uses our shape
      // (named -> { type:'text', parameter_name, text }, positional -> { type:'text', text }).
      const bodyParameters = paramNames.length
        ? paramNames.map((name, i) => isNamed && name
            ? { type: "text", parameter_name: name, text: String(finalParams[i] ?? "Cliente") }
            : { type: "text", text: String(finalParams[i] ?? "Cliente") })
        : finalParams.map((p) => ({ type: "text", text: String(p) }));

      const components: any[] = [];
      if (headerImageUrl) components.push({ type: "header", parameters: [{ type: "image", image: { link: headerImageUrl } }] });
      if (bodyParameters.length) components.push({ type: "body", parameters: bodyParameters });

      const buildSendPayload = (comps: any[]) => ({
        phone,
        template_name: templateName,
        language,
        template_params: finalParams,
        ...(tplPhoneNumberId ? { phone_number_id: String(tplPhoneNumberId), from_phone_number_id: String(tplPhoneNumberId) } : {}),
        ...(comps.length ? { components: comps } : {}),
      });

      // Upsert the contact in the CRM Oficial BEFORE the send so the broadcast can
      // link the recipient. Without this, the CRM shows "0 destinatários" even when
      // Meta delivers the template successfully.
      {
        const firstParam = String(finalParams[0] ?? "").trim();
        const looksLikeName = firstParam
          && !/^\d/.test(firstParam)
          && !/^\+?\d[\d\s\-()]+$/.test(firstParam)
          && !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(firstParam);
        const contactName = String(
          rawBody.contact_name || rawBody.name || (looksLikeName ? firstParam : "") || "Cliente"
        ).trim() || "Cliente";
        try {
          await doContact(
            { name: contactName, phone, stage: "new", notes: "Contato criado automaticamente antes do envio de template" },
            resellerApiKey,
          );
        } catch (e) {
          console.warn("[crm-oficial-sync sendTemplate] falha ao criar contato pré-template:", (e as Error).message);
        }
      }

      let sendResult = await doSendWhatsapp(buildSendPayload(components), resellerApiKey);

      // Self-heal: if Meta still complains about parameter count, parse expected N and retry.
      const extractExpectedParams = (result: any): number | null => {
        const inspect = [result, ...(((result as any)?.attempts) || [])];
        for (const item of inspect) {
          const text = typeof item?.body === "string" ? item.body : JSON.stringify(item?.body || {});
          const m = text.match(/expected number of params\s*\((\d+)\)/i) || text.match(/expected\s*(\d+)\s*params/i);
          if (m) return parseInt(m[1], 10);
        }
        return null;
      };
      if ((sendResult as any)?.ok !== true) {
        const expected = extractExpectedParams(sendResult);
        if (expected && expected > bodyParameters.length) {
          const padded = bodyParameters.slice();
          while (padded.length < expected) {
            const idx = padded.length;
            const name = paramNames[idx] || `p${idx + 1}`;
            padded.push(isNamed ? { type: "text", parameter_name: name, text: "Cliente" } : { type: "text", text: "Cliente" });
          }
          const retryComps = components.filter((c) => String(c?.type).toLowerCase() !== "body").concat([{ type: "body", parameters: padded }]);
          console.log(`[crm-oficial-sync sendTemplate] retry com ${expected} params (${isNamed ? "named" : "positional"})`);
          sendResult = await doSendWhatsapp(buildSendPayload(retryComps), resellerApiKey);
        }
      }

      const ok = (sendResult as any)?.ok === true;

      return new Response(JSON.stringify({ success: ok, send: sendResult, provider: "crm-oficial" }), {
        status: ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const parsed = rawBody as { action: Action; data?: Record<string, unknown> };
    const { action } = parsed;
    const data = parsed.data ?? {};
    if (!action) throw new Error("action é obrigatório");

    // ── ISOLAMENTO MULTI-TENANT ────────────────────────────────────────────
    // Nunca usar a chave global (env) para um usuário logado que não seja admin,
    // senão a revenda enxerga os canais/templates/números do admin.
    let apiKey = (data?.apiKey as string | undefined) || undefined;
    let localUserId = "";
    let isAdminUser = false;
    // "signup" cria a conta no ZapCRM e não precisa de chave (endpoint público).
    if (!apiKey && action !== "signup" && action !== "provision-key" && action !== "ensure-key" && action !== "repair-missing") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      if (jwt && jwt !== svc) {
        const authed = createClient(supaUrl, svc);
        const { data: userData } = await authed.auth.getUser(jwt);
        const uid = userData?.user?.id;
        if (uid) {
          localUserId = uid;
          const { data: adminRole } = await authed
            .from("user_roles")
            .select("role")
            .eq("user_id", uid)
            .eq("role", "admin")
            .maybeSingle();
          isAdminUser = !!adminRole;
          const { data: row } = await authed
            .from("crm_oficial_settings")
            .select("api_key")
            .eq("user_id", uid)
            .maybeSingle();
          const ownKey = (row?.api_key || "").trim();
          if (ownKey) {
            apiKey = ownKey;
          } else if (!isAdminUser) {
            throw new Error(
              "Chave do CRM Oficial não configurada para este usuário. Cadastre sua chave em Configurações → CRM Oficial.",
            );
          }
        }
      }
    }

    // ── LIMITE DE CONEXÕES (1 oficial + 1 não oficial por revenda, admin ilimitado) ──
    async function enforceChannelQuota(kind: "official" | "evolution") {
      if (isAdminUser || !localUserId) return;
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supaUrl, svc);
      const { data: access } = await admin
        .from("reseller_access")
        .select("max_official_channels, max_evolution_instances")
        .eq("user_id", localUserId)
        .maybeSingle();
      const max = Number(
        (kind === "official" ? access?.max_official_channels : access?.max_evolution_instances) ?? 1,
      );

      const list = await crmFetch("/api/public/v1/channels", { method: "GET", apiKey });
      const raw = (list.body as any) || {};
      const arr: any[] = Array.isArray(raw) ? raw : (raw.channels || raw.whatsapp || []);
      const used = arr.filter((c) => {
        const k = String(c?.kind || "").toLowerCase();
        return kind === "official" ? k.includes("cloud") : k.includes("evolution");
      }).length;

      if (used >= max) {
        throw new Error(
          kind === "official"
            ? `Limite de ${max} conexão(ões) da API Oficial atingido. Remova um canal existente ou peça ao administrador para aumentar o limite.`
            : `Limite de ${max} conexão(ões) não oficial atingido. Remova uma conexão existente ou peça ao administrador para aumentar o limite.`,
        );
      }
    }

    const results: Record<string, unknown> = {};

    if (action === "ensure-key") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      const supaUrl = Deno.env.get("SUPABASE_URL") || "";
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const admin = createClient(supaUrl, svc);
      const { data: authData } = await admin.auth.getUser(jwt);
      const callerId = authData?.user?.id;
      if (!callerId) throw new Error("Não autorizado");
      const { data: existing } = await admin.from("crm_oficial_settings").select("api_key").eq("user_id", callerId).maybeSingle();
      const existingKey = (existing?.api_key || "").trim();
      if (existingKey && (await crmKeyIsUsable(existingKey) || await repairCrmKeyScopes(existingKey))) {
        results.api_key = { ok: true, saved: true, existing: true };
      } else {
        const { data: profile } = await admin.from("profiles").select("full_name").eq("user_id", callerId).maybeSingle();
        results.api_key = await provisionManagedCrmKey(callerId, profile?.full_name || undefined);
        if (existingKey) (results.api_key as Record<string, unknown>).replaced_invalid_key = true;
      }
    }

    if (action === "repair-missing") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      const supaUrl = Deno.env.get("SUPABASE_URL") || "";
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const admin = createClient(supaUrl, svc);
      let allowed = jwt === svc;
      if (!allowed) {
        const { data: authData } = await admin.auth.getUser(jwt);
        if (authData?.user?.id) {
          const { data: role } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
          allowed = !!role;
        }
      }
      if (!allowed) throw new Error("Apenas administradores podem reparar integrações");
      const onlyUserId = String((data as any)?.user_id || "").trim();
      let query = admin.from("reseller_access").select("user_id, full_name");
      if (onlyUserId) query = query.eq("user_id", onlyUserId);
      const { data: resellers, error: resellerError } = await query;
      if (resellerError) throw resellerError;
      const repaired: string[] = [];
      const failed: string[] = [];
      for (const reseller of resellers || []) {
        const { data: existing } = await admin.from("crm_oficial_settings").select("api_key").eq("user_id", reseller.user_id).maybeSingle();
        const key = (existing?.api_key || "").trim();
        // Repara também chaves salvas porém sem escopos (403 "Missing scope").
        if (key && await crmKeyIsUsable(key)) continue;
        const provisioned = await provisionManagedCrmKey(reseller.user_id, reseller.full_name || undefined);
        if (provisioned.ok) repaired.push(reseller.user_id);
        else failed.push(reseller.user_id);
      }
      results.repair = { ok: failed.length === 0, repaired_count: repaired.length, failed_count: failed.length, failed };
    }



    if (action === "ping") {
      results.ping = await doPing(apiKey);
    }



    if (action === "signup" || action === "provision-key") {
      const { email, password, full_name, local_user_id } = data as { email: string; password: string; full_name?: string; local_user_id?: string };
      if (!email || !password) throw new Error("email e password são obrigatórios");

      let resolvedKey = "";

      if (action === "signup") {
        const signupRes = await doSignup({ email, password, full_name }, apiKey);
        results.signup = signupRes;
        // O endpoint público de signup do ZapCRM já devolve a api_key da nova conta.
        const sBody = (signupRes as any)?.body;
        const fromSignup = extractSignupApiKey(sBody);
        if (fromSignup) resolvedKey = fromSignup;
      }

      // Fallback: conta já existe (ou signup não devolveu chave) → login e criação da chave.
      if (!resolvedKey) {
        const createdKey = await createCrmIntegrationKey(email, password);
        if (createdKey.ok && (createdKey as any).apiKey) {
          resolvedKey = String((createdKey as any).apiKey);
        } else {
          results.api_key = { ok: false, status: (createdKey as any).status, body: (createdKey as any).body };
        }
      }

      // A senha local pode ser diferente da conta antiga no ZapCRM. Como o revendedor
      // acessa somente pelo embed, criamos uma conta técnica isolada e salvamos sua chave.
      if (!resolvedKey && local_user_id) {
        const authorizedUserId = await getAuthorizedLocalUserId(req, local_user_id);
        if (authorizedUserId) {
          results.api_key = await provisionManagedCrmKey(authorizedUserId, full_name);
        }
      }

      if (resolvedKey) {
        const authorizedUserId = await getAuthorizedLocalUserId(req, local_user_id);
        if (authorizedUserId) {
          const saved = await persistLocalCrmKey(authorizedUserId, resolvedKey);
          results.api_key = { ok: true, saved: saved.ok, save_error: saved.ok ? undefined : saved.error };
          if (!saved.ok) console.error("[crm-oficial-sync] falha ao salvar api_key local:", saved.error);
        } else {
          results.api_key = { ok: true, saved: false, save_error: "local_user_id não autorizado" };
          console.error("[crm-oficial-sync] api_key criada mas local_user_id não autorizado", { local_user_id });
        }
      }
    }

    if (action === "test-chat") {
      const { name, phone, email } = data as { name: string; phone: string; email?: string };
      if (!phone || !name) throw new Error("name e phone são obrigatórios");
      results.contact = await doContact({ name, phone, email, stage: "new", notes: "Canal criado automaticamente pelo SuperGestor" }, apiKey);
      results.message = await doMessage({
        phone,
        name,
        body: `👋 Olá ${name}! Esta é uma conversa de teste criada automaticamente pelo SuperGestor. Seu canal está pronto para uso.`,
      }, apiKey);
    }

    if (action === "renew-notify") {
      const { name, phone, months, expiresAt } = data as { name: string; phone: string; months?: number; expiresAt?: string };
      if (!phone || !name) throw new Error("name e phone são obrigatórios");
      const exp = expiresAt ? new Date(expiresAt).toLocaleDateString("pt-BR") : "—";
      results.message = await doMessage({
        phone,
        name,
        body: `✅ Renovação confirmada${months ? ` (${months} mês${months > 1 ? "es" : ""})` : ""}. Nova validade: ${exp}.`,
      }, apiKey);
    }

    if (action === "list-conversations") {
      results.conversations = await doListConversations(apiKey);
    }

    if (action === "list-messages") {
      const { conversation_id } = data as { conversation_id: string };
      if (!conversation_id) throw new Error("conversation_id é obrigatório");
      results.messages = await doListMessages(conversation_id, apiKey);
    }

    if (action === "send-whatsapp") {
      const { phone, body, name, channel_id, phone_number_id, media_url, media_id, media_type, mime_type, caption, file_name, template_name, template_language, template_params, components } = data as { phone: string; body?: string; name?: string; channel_id?: string; phone_number_id?: string; media_url?: string; media_id?: string; media_type?: string; mime_type?: string; caption?: string; file_name?: string; template_name?: string; template_language?: string; template_params?: unknown[]; components?: unknown[] };
      if (!phone) throw new Error("phone é obrigatório");
      if (!body && !media_url && !media_id && !template_name) throw new Error("body, media_url, media_id ou template_name é obrigatório");
      results.send = await doSendWhatsapp({ phone, body, name, channel_id, phone_number_id, from_phone_number_id: phone_number_id, media_url, media_id, media_type, mime_type, caption, file_name, template_name, template_language, template_params, components }, apiKey);
    }

    if (action === "mark-read") {
      const { conversation_id } = data as { conversation_id: string };
      if (!conversation_id) throw new Error("conversation_id é obrigatório");
      results.read = await firstOk([
        () => crmFetch(`/api/public/v1/conversations/${encodeURIComponent(conversation_id)}/read`, { method: "POST", body: JSON.stringify({}), apiKey }),
        () => crmFetch(`/api/public/v1/conversations/read`, { method: "POST", body: JSON.stringify({ conversation_id }), apiKey }),
        () => crmFetch(`/api/public/v1/conversations/${encodeURIComponent(conversation_id)}`, { method: "PATCH", body: JSON.stringify({ unread_count: 0, read: true }), apiKey }),
      ]);
    }

    if (action === "list-contacts") {
      const { limit } = data as { limit?: number };
      results.contacts = await doListContacts(typeof limit === "number" ? limit : 100, apiKey);
    }

    if (action === "list-channels") {
      const listed = await crmFetch("/api/public/v1/channels", { method: "GET", apiKey });
      results.channels = await enrichChannelsWithMetaNumbers(listed, apiKey);
    }


    if (action === "create-channel") {
      const payload = (data?.channel as Record<string, unknown>) || {};
      if (!payload.kind) throw new Error("kind é obrigatório (whatsapp_cloud | whatsapp_evolution | webchat)");
      const isEvolution = String(payload.kind).includes("evolution");
      if (String(payload.kind).includes("cloud") || isEvolution) {
        await enforceChannelQuota(isEvolution ? "evolution" : "official");
      }



      const doCreate = () => crmFetch("/api/public/v1/channels", {
        method: "POST",
        body: JSON.stringify(payload),
        apiKey,
      });

      let created = await doCreate();

      // A Evolution costuma demorar a responder e o proxy devolve 500 mesmo tendo criado a instância.
      if (!created.ok && isEvolution) {
        for (let attempt = 0; attempt < 3 && !created.ok; attempt++) {
          await new Promise((r) => setTimeout(r, 3500));
          // Se a instância já foi criada, encontramos pelo nome na listagem.
          const list = await crmFetch("/api/public/v1/channels", { method: "GET", apiKey });
          const raw = (list.body as any) || {};
          const arr: any[] = Array.isArray(raw) ? raw : (raw.channels || raw.whatsapp || []);
          const match = arr.find((c) =>
            String(c?.kind || "").includes("evolution") &&
            String(c?.name || "").trim().toLowerCase() === String(payload.name || "").trim().toLowerCase()
          );
          if (match) {
            created = { ok: true, status: 200, body: { channel: match, id: match.id, recovered: true } };
            break;
          }
          created = await doCreate();
        }
      }
      results.channel = created;
    }

    if (action === "channel-qr") {
      const channelId = String((data as any)?.channel_id || (data as any)?.id || "");
      if (!channelId) throw new Error("channel_id é obrigatório");
      let qr = await crmFetch(`/api/public/v1/channels-qr?channel_id=${encodeURIComponent(channelId)}`, {
        method: "GET",
        apiKey,
      });
      for (let attempt = 0; attempt < 2 && !qr.ok; attempt++) {
        await new Promise((r) => setTimeout(r, 2500));
        qr = await crmFetch(`/api/public/v1/channels-qr?channel_id=${encodeURIComponent(channelId)}`, {
          method: "GET",
          apiKey,
        });
      }
      results.qr = qr;
    }



    if (action === "set-primary-channel") {
      const channelId = String((data as any)?.channel_id || (data as any)?.id || "");
      if (!channelId) throw new Error("channel_id é obrigatório");
      // Tenta PATCH; se a API não aceitar, cai para POST /primary
      try {
        results.channel = await crmFetch(`/api/public/v1/channels/${channelId}`, {
          method: "PATCH",
          body: JSON.stringify({ primary: true, is_primary: true }),
          apiKey,
        });
      } catch {
        results.channel = await crmFetch(`/api/public/v1/channels/${channelId}/primary`, {
          method: "POST",
          apiKey,
        });
      }
    }

    if (action === "delete-channel") {
      const channelId = String((data as any)?.channel_id || (data as any)?.id || "");
      if (!channelId) throw new Error("channel_id é obrigatório");
      const encoded = encodeURIComponent(channelId);
      results.channel = await firstOk(
        authKeys(apiKey).flatMap((key) => [
          () => crmFetch(`/api/public/v1/channels?id=${encoded}`, { method: "DELETE", apiKey: key }),
          () => crmFetch(`/api/public/v1/channels/${encoded}`, { method: "DELETE", apiKey: key }),
        ]),
      );
    }


    if (action === "embedded-signup") {
      const { code, phone_number_id, waba_id, config_id, app_id } = (data || {}) as {
        code?: string; phone_number_id?: string; waba_id?: string; config_id?: string; app_id?: string;
      };
      if (!code) throw new Error("code é obrigatório");
      await enforceChannelQuota("official");

      results.embedded = await crmFetch("/api/public/v1/channels/embedded-signup", {
        method: "POST",
        body: JSON.stringify({
          code,
          phone_number_id,
          waba_id,
          config_id,
          app_id,
          source: "supergestor",
        }),
        apiKey,
      });
    }



    if (action === "get-media") {
      const { path, media_url, media_id } = data as { path?: string; media_url?: string; media_id?: string };
      const target = pickString(media_id, path, media_url);
      if (!target) throw new Error("path é obrigatório");
      const isAbsolute = /^https?:\/\//i.test(target);
      let r: Response | null = null;

      if (isAbsolute) {
        r = await fetch(target);
      }

      if (!r?.ok) {
        const attempts: string[] = [];
        for (const key of authKeys(apiKey)) {
          const candidates = [
            media_id ? { param: "id", value: media_id } : null,
            /^\d+$/.test(target) ? { param: "id", value: target } : null,
            { param: "path", value: target },
            media_url ? { param: "media_url", value: media_url } : null,
          ].filter(Boolean) as Array<{ param: string; value: string }>;

          for (const candidate of candidates) {
            r = await fetch(`${CRM_BASE}/api/public/v1/media?${candidate.param}=${encodeURIComponent(candidate.value)}&redirect=1`, {
              headers: { Authorization: `Bearer ${key}` },
            });
            if (r.ok) break;
            const txt = await r.clone().text().catch(() => "");
            attempts.push(`${candidate.param} ${r.status}: ${txt.slice(0, 200)}`);
          }
          if (r.ok) break;
        }
        if (!r?.ok && attempts.length) {
          const useful = attempts.find((item) => !item.includes("id query param is required")) || attempts[attempts.length - 1];
          throw new Error(useful);
        }
      }

      if (!r) throw new Error("Não foi possível baixar a mídia");
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`media ${r.status}: ${txt.slice(0, 200)}`);
      }
      const ct = r.headers.get("content-type") || "application/octet-stream";
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      results.media = { url: `data:${ct};base64,${b64}`, mime: ct };
    }

    if (action === "upload-media") {
      const { mediaBase64, mimetype, filename, user_id } = data as { mediaBase64?: string; mimetype?: string; filename?: string; user_id?: string };
      if (!mediaBase64) throw new Error("mediaBase64 obrigatório");
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      if (!supabaseUrl || !serviceKey) throw new Error("Storage indisponível no servidor");
      const admin = createClient(supabaseUrl, serviceKey);
      const rawFilename = String(filename || `media-${Date.now()}`);
      const safeName = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || `media-${Date.now()}`;
      const owner = String(user_id || "crm-oficial").replace(/[^a-zA-Z0-9_-]/g, "_");
      const bin = Uint8Array.from(atob(mediaBase64), (c) => c.charCodeAt(0));
      const path = `${owner}/crm-oficial/${Date.now()}-${safeName}`;
      const { error: upErr } = await admin.storage.from("evolution-media").upload(path, bin, { contentType: mimetype || "application/octet-stream", upsert: true });
      if (upErr) throw new Error(`Upload falhou: ${upErr.message || upErr}`);
      const { data: signed, error: signErr } = await admin.storage.from("evolution-media").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || "Falha ao assinar mídia");
      results.upload = { url: signed.signedUrl, mediaUrl: signed.signedUrl, path };
    }

    if (action === "list-templates") {
      const { limit } = data as { limit?: number };
      results.templates = await crmFetchWithKeyFallback(`/api/public/v1/templates?limit=${encodeURIComponent(String(limit || 250))}`, { method: "GET" }, apiKey);
    }

    if (action === "create-template") {
      const { template } = data as { template?: Record<string, unknown> };
      if (!template?.name || !template?.language || !template?.category || !Array.isArray(template?.components)) {
        throw new Error("name, language, category e components são obrigatórios");
      }
      results.template = await crmFetchWithKeyFallback("/api/public/v1/templates", { method: "POST", body: JSON.stringify(template) }, apiKey);
    }

    if (action === "update-template") {
      const { template_name, template } = data as { template_name?: string; template?: Record<string, unknown> };
      if (!template_name || !template) throw new Error("template_name e template são obrigatórios");
      results.template = await firstOk([
        ...authKeys(apiKey).flatMap((key) => [
          () => crmFetch(`/api/public/v1/templates/${encodeURIComponent(template_name)}`, { method: "PATCH", body: JSON.stringify(template), apiKey: key }),
          () => crmFetch(`/api/public/v1/templates/${encodeURIComponent(template_name)}`, { method: "PUT", body: JSON.stringify(template), apiKey: key }),
          () => crmFetch("/api/public/v1/templates", { method: "POST", body: JSON.stringify(template), apiKey: key }),
        ]),
      ]);
    }

    if (action === "delete-template") {
      const { template_name, name } = data as { template_name?: string; name?: string };
      const target = template_name || name;
      if (!target) throw new Error("template_name é obrigatório");
      results.template = await crmFetchWithKeyFallback(`/api/public/v1/templates/${encodeURIComponent(target)}`, { method: "DELETE" }, apiKey);
    }

    if (action === "broadcasts-stats") {
      const { broadcast_id, date, from, to } = data as { broadcast_id?: string; date?: string; from?: string; to?: string };
      const params = new URLSearchParams();
      if (broadcast_id) params.set("broadcast_id", broadcast_id);
      if (date) params.set("date", date);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString() ? `?${params.toString()}` : "";
      results.broadcasts_stats = await crmFetchWithKeyFallback(`/api/public/v1/broadcasts-stats${qs}`, { method: "GET" }, apiKey);
    }

    if (action === "list-chatbots") {
      const { limit } = data as { limit?: number };
      results.chatbots = await crmFetch(`/api/public/v1/chatbots?limit=${encodeURIComponent(String(limit || 100))}`, { method: "GET", apiKey });
    }

    if (action === "create-chatbot") {
      const { chatbot } = data as { chatbot?: Record<string, unknown> };
      if (!chatbot?.name) throw new Error("name é obrigatório");
      results.chatbot = await crmFetch("/api/public/v1/chatbots", { method: "POST", body: JSON.stringify(chatbot), apiKey });
    }

    if (action === "update-chatbot") {
      const { chatbot_id, chatbot } = data as { chatbot_id?: string; chatbot?: Record<string, unknown> };
      if (!chatbot_id || !chatbot) throw new Error("chatbot_id e chatbot são obrigatórios");
      results.chatbot = await firstOk([
        () => crmFetch(`/api/public/v1/chatbots/${encodeURIComponent(chatbot_id)}`, { method: "PATCH", body: JSON.stringify(chatbot), apiKey }),
        () => crmFetch(`/api/public/v1/chatbots/${encodeURIComponent(chatbot_id)}`, { method: "PUT", body: JSON.stringify(chatbot), apiKey }),
      ]);
    }

    if (action === "delete-chatbot") {
      const { chatbot_id } = data as { chatbot_id?: string };
      if (!chatbot_id) throw new Error("chatbot_id é obrigatório");
      results.chatbot = await crmFetch(`/api/public/v1/chatbots/${encodeURIComponent(chatbot_id)}`, { method: "DELETE", apiKey });
    }

    if (action === "sso-token") {
      // Tenta diferentes endpoints conhecidos para SSO.
      // Se nenhum existir, o cliente cai em fallback (abre o login do CRM).
      const { redirect } = data as { redirect?: string };
      results.sso = await firstOk(
        authKeys(apiKey).flatMap((key) => [
          () => crmFetch("/api/public/v1/auth/sso-token", {
            method: "POST",
            body: JSON.stringify({ redirect: redirect || "/dashboard" }),
            apiKey: key,
          }),
          () => crmFetch("/api/public/v1/sso-token", {
            method: "POST",
            body: JSON.stringify({ redirect: redirect || "/dashboard" }),
            apiKey: key,
          }),
          () => crmFetch("/api/public/v1/auth/exchange", {
            method: "POST",
            body: JSON.stringify({ redirect: redirect || "/dashboard" }),
            apiKey: key,
          }),
        ]),
      );
    }



    return new Response(JSON.stringify({ success: true, action, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro";
    console.error("crm-oficial-sync error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200, // 200 para não derrubar invokers
    });
  }
});
