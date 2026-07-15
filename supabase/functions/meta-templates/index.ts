import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v21.0";
const CRM_BASE = "https://zapcrm.top";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function crmFetch(path: string, apiKey: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${CRM_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

function normalizeTemplatesBody(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.templates)) return body.templates;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const reqContentType = req.headers.get("content-type") || "";
    let body: any = {};
    let uploadFile: File | null = null;
    if (reqContentType.includes("multipart/form-data")) {
      const form = await req.formData();
      body = Object.fromEntries(form.entries());
      const file = form.get("file");
      if (file && typeof (file as File).arrayBuffer === "function") uploadFile = file as File;
    } else {
      body = await req.json();
    }
    const { action } = body;
    const requestApiKey = String(body?.apiKey || body?.data?.apiKey || "").trim();

    // Resolve CRM Oficial API key (preferred path — always uses the CRM's fresh token)
    let crmApiKey = requestApiKey;
    if (!crmApiKey) {
      const { data } = await supabase
        .from("crm_oficial_settings")
        .select("api_key, enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.api_key) crmApiKey = String(data.api_key);
    }
    if (!crmApiKey) crmApiKey = (Deno.env.get("CRM_OFICIAL_API_KEY") || "").trim();

    // ============================================================
    // Route list/create/update/delete through CRM Oficial REST API
    // (same path the CRM uses internally — no expired local tokens)
    // ============================================================
    if (crmApiKey && (action === "list" || action === "create" || action === "update" || action === "delete")) {
      if (action === "list") {
        const { limit = 250 } = body;
        const r = await crmFetch(`/api/public/v1/templates?limit=${encodeURIComponent(String(limit))}`, crmApiKey, { method: "GET" });
        if (!r.ok) {
          console.error(`[MetaTemplates] CRM list ${r.status}:`, JSON.stringify(r.body).slice(0, 300));
          return json({ error: r.body?.error || `CRM Oficial ${r.status}`, details: r.body }, r.status || 500);
        }
        return json({ data: normalizeTemplatesBody(r.body) });
      }

      if (action === "create") {
        const { name, category, language, components, allow_category_change, parameter_format } = body;
        const payload: any = { name, category, language, components };
        if (parameter_format === "NAMED" || parameter_format === "POSITIONAL") payload.parameter_format = parameter_format;
        if (allow_category_change) payload.allow_category_change = true;
        const r = await crmFetch("/api/public/v1/templates", crmApiKey, { method: "POST", body: JSON.stringify(payload) });
        if (!r.ok) {
          console.error(`[MetaTemplates] CRM create ${r.status}:`, JSON.stringify(r.body).slice(0, 300));
          return json({ error: r.body?.error || `CRM Oficial ${r.status}`, details: r.body }, r.status || 500);
        }
        return json(r.body ?? { success: true });
      }

      if (action === "update") {
        const { template_name, template_id, components: updateComponents, parameter_format } = body;
        const name = template_name || template_id;
        if (!name) return json({ error: "template_name é obrigatório" }, 400);
        const payload: any = { components: updateComponents };
        if (parameter_format === "NAMED" || parameter_format === "POSITIONAL") payload.parameter_format = parameter_format;

        // Try PATCH → PUT → POST fallback
        for (const method of ["PATCH", "PUT"] as const) {
          const r = await crmFetch(`/api/public/v1/templates/${encodeURIComponent(String(name))}`, crmApiKey, { method, body: JSON.stringify(payload) });
          if (r.ok) return json({ success: true, ...(r.body || {}) });
          if (r.status !== 404 && r.status !== 405) {
            console.error(`[MetaTemplates] CRM update ${method} ${r.status}:`, JSON.stringify(r.body).slice(0, 300));
          }
        }
        const r = await crmFetch("/api/public/v1/templates", crmApiKey, { method: "POST", body: JSON.stringify({ name, ...payload }) });
        if (!r.ok) {
          console.error(`[MetaTemplates] CRM update fallback ${r.status}:`, JSON.stringify(r.body).slice(0, 300));
          return json({ error: r.body?.error || `CRM Oficial ${r.status}`, details: r.body }, r.status || 500);
        }
        return json({ success: true, ...(r.body || {}) });
      }

      if (action === "delete") {
        const { template_name } = body;
        if (!template_name) return json({ error: "template_name é obrigatório" }, 400);
        const r = await crmFetch(`/api/public/v1/templates/${encodeURIComponent(String(template_name))}`, crmApiKey, { method: "DELETE" });
        if (!r.ok) {
          console.error(`[MetaTemplates] CRM delete ${r.status}:`, JSON.stringify(r.body).slice(0, 300));
          return json({ error: r.body?.error || `CRM Oficial ${r.status}`, details: r.body }, r.status || 500);
        }
        return json({ success: true });
      }
    }

    // ============================================================
    // Fallback: legacy path (upload-media, analytics, or when no CRM key)
    // Uses locally stored Meta token from zap_responder_settings.
    // ============================================================
    const { data: zapSettings } = await supabase
      .from("zap_responder_settings")
      .select("meta_access_token, meta_business_id")
      .eq("user_id", user.id)
      .not("meta_access_token", "is", null)
      .not("meta_business_id", "is", null)
      .maybeSingle();

    let accessToken = zapSettings?.meta_access_token ? String(zapSettings.meta_access_token) : "";
    let wabaId = zapSettings?.meta_business_id ? String(zapSettings.meta_business_id) : "";

    if (!accessToken || !wabaId) {
      const { data: anyMeta } = await supabase
        .from("zap_responder_settings")
        .select("meta_access_token, meta_business_id")
        .eq("api_type", "meta_cloud")
        .not("meta_access_token", "is", null)
        .not("meta_business_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (anyMeta) {
        accessToken = String(anyMeta.meta_access_token || "");
        wabaId = String(anyMeta.meta_business_id || "");
      }
    }

    if (!accessToken || !wabaId) {
      return json({ error: "Configure a integração com o CRM Oficial em Configurações para gerenciar templates." }, 400);
    }

    // appsecret_proof
    const appSecret = Deno.env.get("META_APP_SECRET");
    let proofParam = "";
    if (appSecret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(accessToken));
      const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
      proofParam = `&appsecret_proof=${hex}`;
    }

    if (action === "upload-media") {
      const { file_base64, file_url, file_name, file_size, mime_type } = body;
      const appId = Deno.env.get("META_APP_ID");
      if (!appId) return json({ error: "META_APP_ID não configurado" }, 400);
      if (!uploadFile && !file_url && !file_base64) return json({ error: "Dados de upload incompletos" }, 400);
      try {
        let bytes: Uint8Array | null = null;
        let resolvedName = uploadFile?.name || file_name || "upload";
        let resolvedMime = uploadFile?.type || mime_type || "application/octet-stream";
        if (uploadFile) {
          bytes = new Uint8Array(await uploadFile.arrayBuffer());
        } else if (file_url) {
          const dl = await fetchWithTimeout(file_url, {}, 30_000);
          if (!dl.ok) return json({ error: `Falha ao baixar file_url (status ${dl.status})` }, 400);
          bytes = new Uint8Array(await dl.arrayBuffer());
          resolvedMime = mime_type || dl.headers.get("content-type") || resolvedMime;
        } else if (file_base64) {
          const binStr = atob(file_base64);
          bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        }
        if (!bytes) return json({ error: "Não foi possível resolver bytes do arquivo" }, 400);
        const resolvedSize = bytes.length;
        const appAccessToken = appSecret ? `${appId}|${appSecret}` : accessToken;
        const sessionUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads?file_name=${encodeURIComponent(resolvedName)}&file_length=${resolvedSize}&file_type=${encodeURIComponent(resolvedMime)}&access_token=${encodeURIComponent(appAccessToken)}`;
        const sessRes = await fetchWithTimeout(sessionUrl, { method: "POST" }, 25_000);
        const sessData = await sessRes.json();
        if (!sessRes.ok || !sessData?.id) {
          return json({ error: sessData?.error?.message || `Falha ao iniciar upload (${sessRes.status})`, details: sessData?.error }, 400);
        }
        const upRes = await fetchWithTimeout(`https://graph.facebook.com/${GRAPH_API_VERSION}/${sessData.id}`, {
          method: "POST",
          headers: { Authorization: `OAuth ${appAccessToken}`, file_offset: "0", "Content-Type": resolvedMime },
          body: bytes,
        }, 60_000);
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok || !upData?.h) {
          return json({ error: upData?.error?.message || `Falha ao enviar arquivo (${upRes.status})`, details: upData?.error }, 400);
        }
        const headerHandle = String(upData.h || "").split(/\s+/).find(Boolean) || String(upData.h || "");
        return json({ header_handle: headerHandle });
      } catch (e: any) {
        const isAbort = e?.name === "AbortError";
        return json({ error: isAbort ? "Tempo esgotado ao enviar mídia." : e?.message || "Erro no upload" }, isAbort ? 504 : 500);
      }
    }

    if (action === "analytics") {
      const { template_ids, start_date, end_date } = body;
      const analyticsFields = "sent,delivered,read,clicks,url_clicks";
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}?fields=template_analytics.start(${start_date}).end(${end_date}).granularity(DAILY).template_ids(${template_ids.join(",")}).types(${analyticsFields})${proofParam}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) return json({ template_analytics: { data: [] } });
      return json(data);
    }

    return json({ error: "Ação inválida ou CRM Oficial não configurado" }, 400);
  } catch (error: any) {
    console.error("[MetaTemplates] Error:", error);
    return json({ error: error.message || "Erro interno" }, 500);
  }
});
