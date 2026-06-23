// Integração com CRM Oficial (https://crmapioficial.lovable.app)
// Ações suportadas (todas idempotentes, falham silenciosamente para não quebrar fluxo):
//   - signup       : cria conta no CRM para um novo revendedor
//   - test-chat    : cria contato + mensagem (in) no inbox da conta master, simulando chat de teste
//   - renew-notify : registra renovação no inbox master via /messages (direction=in)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRM_BASE = "https://crmapioficial.lovable.app";

type Action =
  | "signup" | "test-chat" | "renew-notify" | "ping"
  | "list-conversations" | "list-messages" | "send-whatsapp" | "mark-read"
  | "list-contacts" | "list-channels" | "create-channel" | "get-media"
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
  if (!supabaseUrl || !serviceKey) return url;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível baixar a imagem do template (${response.status}). Cadastre uma imagem pública em Configurações → Cobrança.`);

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const admin = createClient(supabaseUrl, serviceKey);
  const path = `crm-oficial-template-headers/${Date.now()}-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;
  const { error } = await admin.storage.from("reseller-assets").upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Falha ao publicar imagem do template: ${error.message || error}`);
  const { data } = admin.storage.from("reseller-assets").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Falha ao gerar URL pública da imagem do template");
  return data.publicUrl;
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
}, apiKey?: string) {
  const final: Record<string, unknown> = { ...payload };
  if (payload.media_url && !final.mediaUrl) final.mediaUrl = payload.media_url;
  if (payload.media_id && !final.mediaId) final.mediaId = payload.media_id;
  if (payload.media_type && !final.mediaType) final.mediaType = payload.media_type;
  if (payload.file_name && !final.fileName) final.fileName = payload.file_name;
  if (payload.mime_type && !final.mimetype) final.mimetype = payload.mime_type;
  if (payload.caption && !payload.body) final.body = payload.caption;

  // Template oficial: usar endpoint /whatsapp-template-send se houver template_name.
  if (payload.template_name) {
    const lang = payload.template_language || payload.language || "pt_BR";
    const params = Array.isArray(payload.template_params) ? payload.template_params : [];
    const fallbackBody = textFromUnknown(payload.body).trim() || params.map(textFromUnknown).filter(Boolean).join(" ");
    const components = Array.isArray(payload.components) && payload.components.length
      ? payload.components
      : (params.length ? [{ type: "body", parameters: params.map(p => ({ type: "text", text: String(p) })) }] : []);
    const rawHeaderImageUrl = imageHeaderFromComponents(components);
    const headerImageUrl = rawHeaderImageUrl ? await ensurePublicMediaUrl(rawHeaderImageUrl, String(payload.template_name)) : undefined;
    const officialPayload: Record<string, unknown> = {
      phone: payload.phone,
      to: payload.phone,
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
      ...(components.length ? { components } : {}),
      ...(headerImageUrl ? { header_image_url: headerImageUrl, headerImageUrl } : {}),
    };
    const legacyPayload: Record<string, unknown> = {
      phone: payload.phone,
      to: payload.phone,
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
      template_params: params,
      templateParams: params,
      components,
      ...(headerImageUrl ? { header_image_url: headerImageUrl, headerImageUrl } : {}),
      template: { name: payload.template_name, language: { code: lang, policy: "deterministic" }, components },
    };
    const variablePayload: Record<string, unknown> = {
      phone: payload.phone,
      to: payload.phone,
      name: payload.name,
      channel_id: payload.channel_id,
      channelId: payload.channel_id,
      phone_number_id: payload.phone_number_id || payload.from_phone_number_id,
      phoneNumberId: payload.phone_number_id || payload.from_phone_number_id,
      from_phone_number_id: payload.from_phone_number_id || payload.phone_number_id,
      body: fallbackBody || payload.template_name,
      template_name: payload.template_name,
      language: lang,
      parameters: params,
      variables: { body_text: params.map(textFromUnknown).filter(Boolean) },
      ...(headerImageUrl ? { header_image_url: headerImageUrl, headerImageUrl } : {}),
    };
    // Tenta endpoints específicos de template. NÃO faz fallback para /whatsapp-send (texto puro),
    // pois isso enviaria sem imagem/botões/formatação do template — exatamente o bug que estamos corrigindo.
    const templateAttempts: Array<() => Promise<{ ok: boolean; status: number; body: unknown }>> = [
      () => crmFetch("/api/public/v1/whatsapp-template-send", { method: "POST", body: JSON.stringify(officialPayload), apiKey }),
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
      ok: templateResult.ok,
      status: templateResult.status,
      attempts: (templateResult as { attempts?: Array<{ status: number; body: unknown }> }).attempts?.map((a) => ({ status: a.status, body: a.body })),
    });
    if (templateResult.ok) return templateResult;
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
    return {
      ok: false,
      status: templateResult.status || 502,
      body: {
        error: "Nenhum endpoint de template do CRM Oficial respondeu com sucesso. Peça ao dev do CRM para confirmar /api/public/v1/whatsapp-template-send (envio de template Meta com header/imagem/botões).",
        attempts: attemptsSummary,
      },
    };
  }


  // Plain text / mídia: /whatsapp-send precisa de body não vazio.
  if (!final.body || !String(final.body).trim()) {
    if (payload.file_name) final.body = String(payload.file_name);
    else final.body = " ";
  }
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
    const parsed = (await req.json().catch(() => ({}))) as { action: Action; data?: Record<string, unknown> };
    const { action } = parsed;
    const data = parsed.data ?? {};
    if (!action) throw new Error("action é obrigatório");

    const apiKey = (data?.apiKey as string | undefined) || undefined;
    const results: Record<string, unknown> = {};

    if (action === "ping") {
      results.ping = await doPing(apiKey);
    }

    if (action === "signup") {
      const { email, password, full_name } = data as { email: string; password: string; full_name?: string };
      if (!email || !password) throw new Error("email e password são obrigatórios");
      results.signup = await doSignup({ email, password, full_name }, apiKey);
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
      results.channels = await crmFetch("/api/public/v1/channels", { method: "GET", apiKey });
    }

    if (action === "create-channel") {
      const payload = (data?.channel as Record<string, unknown>) || {};
      if (!payload.kind) throw new Error("kind é obrigatório (whatsapp_cloud | webchat)");
      results.channel = await crmFetch("/api/public/v1/channels", {
        method: "POST",
        body: JSON.stringify(payload),
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
