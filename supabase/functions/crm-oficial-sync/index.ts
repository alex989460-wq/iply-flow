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
  media_url?: string;
  mediaUrl?: string;
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
  // /whatsapp-send aceita body + media_url + media_type. Para legendas o body é a caption.
  const final: Record<string, unknown> = { ...payload };
  if (payload.media_url && !final.mediaUrl) final.mediaUrl = payload.media_url;
  if (payload.media_type && !final.mediaType) final.mediaType = payload.media_type;
  if (payload.file_name && !final.fileName) final.fileName = payload.file_name;
  if (payload.mime_type && !final.mimetype) final.mimetype = payload.mime_type;
  if (payload.template_name) final.template = { name: payload.template_name, language: payload.template_language || payload.language || "pt_BR", params: payload.template_params || [] };
  if (payload.caption && !payload.body) final.body = payload.caption;
  // O endpoint /whatsapp-send exige body não vazio mesmo para templates/mídia.
  if (!final.body || !String(final.body).trim()) {
    if (payload.template_name) final.body = `[template:${payload.template_name}]`;
    else if (payload.file_name) final.body = String(payload.file_name);
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
      const { phone, body, name, media_url, media_type, mime_type, caption, file_name, template_name, template_language, template_params, components } = data as { phone: string; body?: string; name?: string; media_url?: string; media_type?: string; mime_type?: string; caption?: string; file_name?: string; template_name?: string; template_language?: string; template_params?: unknown[]; components?: unknown[] };
      if (!phone) throw new Error("phone é obrigatório");
      if (!body && !media_url && !template_name) throw new Error("body, media_url ou template_name é obrigatório");
      results.send = await doSendWhatsapp({ phone, body, name, media_url, media_type, mime_type, caption, file_name, template_name, template_language, template_params, components }, apiKey);
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
      const { path, media_url } = data as { path?: string; media_url?: string };
      const target = path || media_url;
      if (!target) throw new Error("path é obrigatório");
      const isAbsolute = /^https?:\/\//i.test(target);
      let r: Response | null = null;

      if (isAbsolute) {
        r = await fetch(target);
      }

      if (!r?.ok) {
        const attempts: string[] = [];
        for (const key of authKeys(apiKey)) {
          r = await fetch(`${CRM_BASE}/api/public/v1/media?path=${encodeURIComponent(target)}`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (r.ok) break;
          attempts.push(`media ${r.status}: ${(await r.clone().text()).slice(0, 200)}`);
        }
        if (!r?.ok && attempts.length) throw new Error(attempts[attempts.length - 1]);
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
