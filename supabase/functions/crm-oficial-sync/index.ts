// Integração com CRM Oficial (https://crmapioficial.lovable.app)
// Ações suportadas (todas idempotentes, falham silenciosamente para não quebrar fluxo):
//   - signup       : cria conta no CRM para um novo revendedor
//   - test-chat    : cria contato + mensagem (in) no inbox da conta master, simulando chat de teste
//   - renew-notify : registra renovação no inbox master via /messages (direction=in)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRM_BASE = "https://crmapioficial.lovable.app";

type Action = "signup" | "test-chat" | "renew-notify" | "ping" | "list-conversations" | "list-messages" | "send-whatsapp" | "list-contacts" | "list-channels" | "create-channel" | "get-media";

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

async function doSendWhatsapp(payload: { phone: string; body?: string; name?: string; media_url?: string; media_type?: string; caption?: string; file_name?: string }, apiKey?: string) {
  // /whatsapp-send aceita body + media_url + media_type. Para legendas o body é a caption.
  const final: Record<string, unknown> = { ...payload };
  if (payload.caption && !payload.body) final.body = payload.caption;
  if (!final.body) final.body = "";
  return crmFetch("/api/public/v1/whatsapp-send", {
    method: "POST",
    body: JSON.stringify(final),
    apiKey,
  });
}

async function doListContacts(limit: number, apiKey?: string) {
  return crmFetch(`/api/public/v1/contacts?limit=${limit}`, { method: "GET", apiKey });
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, data } = (await req.json()) as { action: Action; data: Record<string, unknown> };
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
      const { phone, body, name, media_url, media_type, caption, file_name } = data as { phone: string; body?: string; name?: string; media_url?: string; media_type?: string; caption?: string; file_name?: string };
      if (!phone) throw new Error("phone é obrigatório");
      if (!body && !media_url) throw new Error("body ou media_url é obrigatório");
      results.send = await doSendWhatsapp({ phone, body, name, media_url, media_type, caption, file_name }, apiKey);
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
      // Se já é URL absoluta, devolve direto
      if (/^https?:\/\//i.test(target)) {
        results.media = { url: target };
      } else {
        // Proxy: baixa via /api/public/v1/media e devolve data URL
        const apiKeyHere = apiKey || Deno.env.get("CRM_OFICIAL_API_KEY") || "";
        const r = await fetch(`${CRM_BASE}/api/public/v1/media?path=${encodeURIComponent(target)}`, {
          headers: { Authorization: `Bearer ${apiKeyHere}` },
        });
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
