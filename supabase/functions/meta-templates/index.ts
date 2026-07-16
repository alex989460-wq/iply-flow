import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v21.0";
const CRM_BASE = "https://zapcrm.top";
const CRM_SUPABASE_URL = "https://qoijgbmbwcmnmvixsbrv.supabase.co";
const CRM_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaWpnYm1id2Ntbm12aXhzYnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjI3MTIsImV4cCI6MjA5NzI5ODcxMn0.IgBFtqw8O2bwmOFU3iWIwkvUZ2_KWOK_-CGWt2P1buw";

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

async function getCrmOwnerSession(apiKey: string) {
  const embed = await crmFetch("/api/public/v1/embed-session", apiKey, {
    method: "POST",
    body: JSON.stringify({ redirect: "/app/inbox" }),
  });
  const tokenHash = (embed.body as any)?.token_hash;
  if (!embed.ok || !tokenHash) throw new Error(`Não foi possível abrir sessão do CRM Oficial (${embed.status})`);

  const verify = await fetch(`${CRM_SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CRM_SUPABASE_ANON_KEY },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await verify.json().catch(() => ({}));
  if (!verify.ok || !session?.access_token) throw new Error("Sessão do CRM Oficial inválida");
  return String(session.access_token);
}

async function crmRest(path: string, accessToken: string) {
  const res = await fetch(`${CRM_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: CRM_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body));
  return body;
}

async function appSecretProof(accessToken: string) {
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(accessToken));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isExpiredTokenError(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  return /validating access token|session has expired|OAuthException|code\s*190/i.test(text);
}

async function listTemplatesDirectFromCrm(apiKey: string, limit = 250) {
  const accessToken = await getCrmOwnerSession(apiKey);
  const credentials: Array<{ source: string; phone_number_id?: string; waba_id?: string; system_user_token?: string }> = [];

  try {
    const legacy = await crmRest("whatsapp_settings?select=phone_number_id,system_user_token,waba_id&limit=1", accessToken) as any[];
    for (const row of legacy || []) credentials.push({ source: "primary", ...row });
  } catch (e) {
    console.warn("[MetaTemplates] CRM primary credentials unavailable:", e instanceof Error ? e.message : e);
  }

  try {
    const channels = await crmRest("channels?select=id,phone_number_id,system_user_token,waba_id,is_active,created_at&kind=eq.whatsapp_cloud&is_active=eq.true&order=created_at.desc", accessToken) as any[];
    for (const row of channels || []) credentials.push({ source: "channel", ...row });
  } catch (e) {
    console.warn("[MetaTemplates] CRM channel credentials unavailable:", e instanceof Error ? e.message : e);
  }

  const seen = new Set<string>();
  const errors: string[] = [];
  for (const cred of credentials) {
    const wabaId = String(cred.waba_id || "").trim();
    const token = String(cred.system_user_token || "").trim();
    const key = `${wabaId}:${cred.phone_number_id || ""}`;
    if (!wabaId || !token || seen.has(key)) continue;
    seen.add(key);

    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates`);
    url.searchParams.set("fields", "id,name,status,language,category,components,quality_score,parameter_format");
    url.searchParams.set("limit", String(limit));
    const res = await fetchWithTimeout(url.toString(), { headers: { Authorization: `Bearer ${token}` } }, 25_000);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`[MetaTemplates] Templates carregados direto do CRM Oficial (${cred.source}, WABA ${wabaId})`);
      return Array.isArray(data?.data) ? data.data : normalizeTemplatesBody(data);
    }

    const message = data?.error?.message || JSON.stringify(data?.error || data || {}).slice(0, 220);
    errors.push(`${cred.source}/${wabaId}: ${message}`);
    console.warn(`[MetaTemplates] Ignorando canal CRM Oficial com falha (${cred.source}, WABA ${wabaId}):`, message);
    if (!isExpiredTokenError(data)) continue;
  }

  throw new Error(errors[0] || "Nenhum canal WhatsApp Cloud válido encontrado no CRM Oficial.");
}

function normalizeTemplatesBody(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.templates)) return body.templates;
  if (Array.isArray(body?.results?.templates)) return body.results.templates;
  if (Array.isArray(body?.results?.templates?.body?.data)) return body.results.templates.body.data;
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
          if (isExpiredTokenError(r.body)) {
            const direct = await listTemplatesDirectFromCrm(crmApiKey, Number(limit) || 250);
            return json({ data: direct });
          }
          return json({ error: r.body?.error || `CRM Oficial ${r.status}`, details: r.body }, r.status || 500);
        }
        return json({ data: normalizeTemplatesBody(r.body) });
      }

      if (action === "create") {
        const { name, category, language, components, allow_category_change, parameter_format } = body;
        const payload: any = { name, category, language, components };
        if (parameter_format === "NAMED" || parameter_format === "POSITIONAL") payload.parameter_format = parameter_format;
        if (allow_category_change) payload.allow_category_change = true;
        console.log(`[MetaTemplates] CRM create payload:`, JSON.stringify(payload).slice(0, 2000));
        let r = await crmFetch("/api/public/v1/templates", crmApiKey, { method: "POST", body: JSON.stringify(payload) });

        // CRM proxy sometimes rejects `parameter_format` with generic "Invalid parameter".
        // Meta auto-detects the format from body_text_named_params / body_text_examples,
        // so retry once without the top-level parameter_format.
        const errText = JSON.stringify(r.body || "").toLowerCase();
        if (!r.ok && payload.parameter_format && (errText.includes("invalid parameter") || r.status === 400 || r.status === 502)) {
          console.warn("[MetaTemplates] Retrying create without parameter_format after error:", r.status, errText.slice(0, 200));
          const retryPayload = { ...payload };
          delete retryPayload.parameter_format;
          r = await crmFetch("/api/public/v1/templates", crmApiKey, { method: "POST", body: JSON.stringify(retryPayload) });
        }

        if (!r.ok) {
          console.error(`[MetaTemplates] CRM create ${r.status}:`, JSON.stringify(r.body).slice(0, 500));
          const detailMsg = (r.body as any)?.error?.error_user_msg
            || (r.body as any)?.error?.message
            || (typeof (r.body as any)?.error === "string" ? (r.body as any).error : null)
            || `CRM Oficial ${r.status}`;
          return json({ error: detailMsg, details: r.body }, r.status || 500);
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
        if (r.ok) return json({ success: true });
        console.error(`[MetaTemplates] CRM delete ${r.status}:`, JSON.stringify(r.body).slice(0, 300));

        // Fallback: delete directly via Meta Graph API using CRM's owner credentials
        try {
          const accessToken = await getCrmOwnerSession(crmApiKey);
          const credentials: Array<any> = [];
          try {
            const legacy = await crmRest("whatsapp_settings?select=system_user_token,waba_id&limit=1", accessToken) as any[];
            for (const row of legacy || []) credentials.push(row);
          } catch (_) { /* ignore */ }
          try {
            const channels = await crmRest("channels?select=system_user_token,waba_id&kind=eq.whatsapp_cloud&is_active=eq.true&order=created_at.desc", accessToken) as any[];
            for (const row of channels || []) credentials.push(row);
          } catch (_) { /* ignore */ }
          const seen = new Set<string>();
          let lastErr = "";
          for (const cred of credentials) {
            const wabaId = String(cred?.waba_id || "").trim();
            const tk = String(cred?.system_user_token || "").trim();
            if (!wabaId || !tk || seen.has(wabaId)) continue;
            seen.add(wabaId);
            const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates`);
            url.searchParams.set("name", String(template_name));
            const del = await fetchWithTimeout(url.toString(), {
              method: "DELETE",
              headers: { Authorization: `Bearer ${tk}` },
            }, 20_000);
            const dtxt = await del.text();
            if (del.ok) {
              console.log(`[MetaTemplates] Graph delete OK (WABA ${wabaId}) name=${template_name}`);
              return json({ success: true });
            }
            lastErr = `${del.status}: ${dtxt.slice(0, 200)}`;
            console.warn(`[MetaTemplates] Graph delete failed WABA ${wabaId}: ${lastErr}`);
          }
          return json({ error: lastErr || (typeof r.body === "string" ? r.body : (r.body?.error || `CRM Oficial ${r.status}`)), details: r.body }, r.status || 500);
        } catch (fallbackErr: any) {
          return json({ error: r.body?.error || fallbackErr?.message || `CRM Oficial ${r.status}`, details: r.body }, r.status || 500);
        }
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

    // upload-media only needs META_APP_ID + META_APP_SECRET (app access token),
    // não depende do WABA/accessToken local — não bloquear por falta de config CRM.
    if ((!accessToken || !wabaId) && action !== "upload-media") {
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
