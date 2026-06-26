import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v21.0";
const CRM_BASE = "https://crmapioficial.lovable.app";
const CRM_SUPABASE_URL = "https://qoijgbmbwcmnmvixsbrv.supabase.co";
const CRM_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaWpnYm1id2Ntbm12aXhzYnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjI3MTIsImV4cCI6MjA5NzI5ODcxMn0.IgBFtqw8O2bwmOFU3iWIwkvUZ2_KWOK_-CGWt2P1buw";

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function crmFetch(path: string, init: RequestInit & { apiKey?: string } = {}) {
  const apiKey = (init.apiKey || Deno.env.get("CRM_OFICIAL_API_KEY") || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${CRM_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(typeof body === "string" ? body : (body?.error || JSON.stringify(body)));
  return body;
}

async function getCrmOwnerSession(apiKey: string) {
  const embed = await crmFetch("/api/public/v1/embed-session", {
    method: "POST",
    body: JSON.stringify({ redirect: "/app/inbox" }),
    apiKey,
  });
  const tokenHash = embed?.token_hash;
  if (!tokenHash) throw new Error("CRM Oficial não retornou sessão segura");

  const verify = await fetch(`${CRM_SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CRM_SUPABASE_ANON_KEY },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await verify.json().catch(() => ({}));
  if (!verify.ok || !session?.access_token || !session?.user?.id) throw new Error("Sessão do CRM Oficial inválida");
  return { accessToken: String(session.access_token), ownerId: String(session.user.id) };
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

async function resolveCrmOfficialMetaCredentials(supabase: any, userId: string, preferredApiKey?: string) {
  let apiKey = (preferredApiKey || "").trim();
  if (!apiKey) {
    const { data } = await supabase
      .from("crm_oficial_settings")
      .select("api_key, enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.enabled && data?.api_key) apiKey = String(data.api_key);
  }
  if (!apiKey) apiKey = (Deno.env.get("CRM_OFICIAL_API_KEY") || "").trim();
  if (!apiKey) return null;

  const { accessToken } = await getCrmOwnerSession(apiKey);
  let channels = await crmRest(
    `channels?select=id,phone_number_id,system_user_token,waba_id,is_active,created_at&kind=eq.whatsapp_cloud&is_active=eq.true&order=created_at.desc`,
    accessToken,
  ).catch(() => []) as any[];
  if (!Array.isArray(channels)) channels = [];

  let creds = channels.find((c) => c?.system_user_token && (c?.waba_id || c?.phone_number_id));
  if (!creds) {
    const legacy = await crmRest(`whatsapp_settings?select=phone_number_id,system_user_token,waba_id&limit=1`, accessToken).catch(() => []) as any[];
    creds = Array.isArray(legacy) ? legacy.find((c) => c?.system_user_token && (c?.waba_id || c?.phone_number_id)) : null;
  }
  if (!creds?.system_user_token) return null;

  let wabaId = creds.waba_id ? String(creds.waba_id) : "";
  if (!wabaId && creds.phone_number_id) {
    const phoneRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${creds.phone_number_id}?fields=whatsapp_business_account{id}&access_token=${encodeURIComponent(String(creds.system_user_token))}`);
    const phoneData = await phoneRes.json().catch(() => ({}));
    wabaId = phoneData?.whatsapp_business_account?.id ? String(phoneData.whatsapp_business_account.id) : "";
  }
  if (!wabaId) return null;
  return { accessToken: String(creds.system_user_token), wabaId, source: "crm_oficial", skipAppSecretProof: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Get Meta credentials - first try legacy local Meta settings, then CRM Oficial connected channels.
    let { data: zapSettings } = await supabase
      .from("zap_responder_settings")
      .select("meta_access_token, meta_business_id")
      .eq("user_id", user.id)
      .not("meta_access_token", "is", null)
      .not("meta_business_id", "is", null)
      .maybeSingle();

    let accessToken = zapSettings?.meta_access_token ? String(zapSettings.meta_access_token) : "";
    let wabaId = zapSettings?.meta_business_id ? String(zapSettings.meta_business_id) : "";
    let skipAppSecretProof = false;

    if (!accessToken || !wabaId) {
      try {
        const crmCreds = await resolveCrmOfficialMetaCredentials(supabase, user.id, requestApiKey);
        if (crmCreds?.accessToken && crmCreds?.wabaId) {
          accessToken = crmCreds.accessToken;
          wabaId = crmCreds.wabaId;
          skipAppSecretProof = !!crmCreds.skipAppSecretProof;
          console.log(`[MetaTemplates] Using CRM Oficial channel credentials (${crmCreds.source})`);
        }
      } catch (e) {
        console.warn("[MetaTemplates] CRM Oficial credential fallback failed:", e instanceof Error ? e.message : e);
      }
    }

    // If user doesn't have Meta credentials, find any account that does (admin scenario)
    if (!accessToken || !wabaId) {
      const { data: anyMeta } = await supabase
        .from("zap_responder_settings")
        .select("meta_access_token, meta_business_id")
        .eq("api_type", "meta_cloud")
        .not("meta_access_token", "is", null)
        .not("meta_business_id", "is", null)
        .limit(1)
        .single();

      if (anyMeta) {
        zapSettings = anyMeta;
        accessToken = zapSettings?.meta_access_token ? String(zapSettings.meta_access_token) : "";
        wabaId = zapSettings?.meta_business_id ? String(zapSettings.meta_business_id) : "";
      }
    }

    if (!accessToken || !wabaId) {
      return new Response(
        JSON.stringify({ error: "API Oficial não configurada. Conecte um canal oficial Meta em Conexões antes de criar templates com mídia." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate appsecret_proof
    const appSecret = Deno.env.get("META_APP_SECRET");
    let appsecretProof = "";
    if (appSecret && !skipAppSecretProof) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(accessToken));
      appsecretProof = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const proofParam = appsecretProof ? `&appsecret_proof=${appsecretProof}` : "";

    // Try to get the actual WABA ID from the Business ID
    // The meta_business_id might be a Facebook Business ID, not a WABA ID
    // We need to resolve it to a WABA ID for the templates API
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/owned_whatsapp_business_accounts?fields=id,name${proofParam}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const wabaData = await wabaRes.json();
      if (wabaRes.ok && wabaData?.data?.length > 0) {
        console.log(`[MetaTemplates] Resolved WABA ID: ${wabaData.data[0].id} (from Business ID: ${wabaId})`);
        wabaId = wabaData.data[0].id;
      } else {
        // If it fails, the ID might already be a WABA ID, continue as-is
        console.log(`[MetaTemplates] Using ID as-is (might be WABA ID already): ${wabaId}`);
      }
    } catch (e) {
      console.log(`[MetaTemplates] Could not resolve WABA ID, using as-is: ${wabaId}`);
    }

    switch (action) {
      case "list": {
        const { limit = 100 } = body;
        const fields = "id,name,status,category,language,parameter_format,components,quality_score,message_send_ttl_seconds";

        // Discover ALL accessible WABAs (same approach billing uses)
        const wabaIds = new Set<string>();
        wabaIds.add(wabaId);
        try {
          const bizRes = await fetch(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses?fields=id,name&limit=100${proofParam}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const bizData = await bizRes.json();
          if (bizRes.ok && Array.isArray(bizData?.data)) {
            for (const biz of bizData.data) {
              try {
                const wabaRes = await fetch(
                  `https://graph.facebook.com/${GRAPH_API_VERSION}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&limit=100${proofParam}`,
                  { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                const wabaData = await wabaRes.json();
                if (wabaRes.ok && Array.isArray(wabaData?.data)) {
                  for (const w of wabaData.data) wabaIds.add(w.id);
                }
              } catch (_) { /* ignore */ }
            }
          }
        } catch (_) { /* ignore */ }

        console.log(`[MetaTemplates] Fetching templates from ${wabaIds.size} WABA(s)`);

        const allTemplates: any[] = [];
        const seen = new Set<string>();
        for (const wId of wabaIds) {
          try {
            const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${wId}/message_templates?limit=${limit}&fields=${fields}${proofParam}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            const data = await res.json();
            if (!res.ok) {
              console.error(`[MetaTemplates] WABA ${wId} list error:`, data?.error?.message);
              continue;
            }
            for (const t of (data?.data || [])) {
              const key = `${wId}:${t.name}:${t.language}`;
              if (!seen.has(key)) {
                seen.add(key);
                allTemplates.push({ ...t, waba_id: wId });
              }
            }
          } catch (e) {
            console.error(`[MetaTemplates] WABA ${wId} fetch failed:`, e);
          }
        }

        return new Response(JSON.stringify({ data: allTemplates }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "upload-media": {
        // Resumable upload to obtain a header_handle ("h") for media templates.
        const { file_base64, file_url, file_name, file_size, mime_type } = body;
        const appId = Deno.env.get("META_APP_ID");
        if (!appId) {
          return json({ error: "META_APP_ID não configurado" }, 400);
        }
        if (!uploadFile && !file_url && !file_base64) {
          return json({ error: "Dados de upload incompletos (envie file_url, file ou file_base64)" }, 400);
        }
        try {
          // 1) Resolve bytes + metadata
          let bytes: Uint8Array | null = null;
          let resolvedName = uploadFile?.name || file_name || "upload";
          let resolvedMime = uploadFile?.type || mime_type || "application/octet-stream";

          if (uploadFile) {
            bytes = new Uint8Array(await uploadFile.arrayBuffer());
          } else if (file_url) {
            const dl = await fetchWithTimeout(file_url, {}, 30_000);
            if (!dl.ok) return json({ error: `Falha ao baixar file_url (status ${dl.status})` }, 400);
            const ab = await dl.arrayBuffer();
            bytes = new Uint8Array(ab);
            resolvedMime = mime_type || dl.headers.get("content-type") || resolvedMime;
          } else if (file_base64) {
            const binStr = atob(file_base64);
            bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          }
          if (!bytes) return json({ error: "Não foi possível resolver os bytes do arquivo" }, 400);
          const resolvedSize = bytes.length;

          const headerType = String(body.header_type || "").toUpperCase();
          const maxSize = headerType === "IMAGE" || resolvedMime.startsWith("image/")
            ? 5 * 1024 * 1024
            : headerType === "VIDEO" || resolvedMime.startsWith("video/")
              ? 16 * 1024 * 1024
              : 20 * 1024 * 1024;
          if (!resolvedSize || resolvedSize > maxSize) {
            return json({ error: `Arquivo inválido ou acima do limite de ${Math.round(maxSize / 1024 / 1024)}MB` }, 400);
          }

          // 2) Start resumable upload session (app access token works best for /APP_ID/uploads)
          const appAccessToken = appSecret ? `${appId}|${appSecret}` : accessToken;
          const sessionUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads?file_name=${encodeURIComponent(resolvedName)}&file_length=${resolvedSize}&file_type=${encodeURIComponent(resolvedMime)}&access_token=${encodeURIComponent(appAccessToken)}`;
          const sessRes = await fetchWithTimeout(sessionUrl, { method: "POST" }, 25_000);
          const sessData = await sessRes.json();
          console.log("[MetaTemplates] Upload session:", sessRes.status, JSON.stringify(sessData).slice(0, 400));
          if (!sessRes.ok || !sessData?.id) {
            const msg = sessData?.error?.message || sessData?.error?.error_user_msg || `Falha ao iniciar upload (status ${sessRes.status})`;
            return json({ error: msg, details: sessData?.error }, 400);
          }

          // 3) Upload bytes
          const upRes = await fetchWithTimeout(`https://graph.facebook.com/${GRAPH_API_VERSION}/${sessData.id}`, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${appAccessToken}`,
              file_offset: "0",
              "Content-Type": resolvedMime,
            },
            body: bytes,
          }, 60_000);
          const upText = await upRes.text();
          let upData: any = {};
          try { upData = JSON.parse(upText); } catch { /* not json */ }
          console.log("[MetaTemplates] Upload result:", upRes.status, upText.slice(0, 400));
          if (!upRes.ok || !upData?.h) {
            const msg = upData?.error?.message || upData?.error?.error_user_msg || `Falha ao enviar arquivo (status ${upRes.status})`;
            return json({ error: msg, details: upData?.error || upText.slice(0, 300) }, 400);
          }
          const headerHandle = String(upData.h || "").split(/\s+/).find(Boolean) || String(upData.h || "");
          return json({ header_handle: headerHandle });
        } catch (e: any) {
          console.error("[MetaTemplates] Upload exception:", e);
          const isAbort = e?.name === "AbortError";
          return json({ error: isAbort ? "Tempo esgotado ao enviar mídia para a Meta. Tente um arquivo menor." : e?.message || "Erro no upload" }, isAbort ? 504 : 500);
        }
      }


      case "create": {
        const { name, category, language, components, allow_category_change, parameter_format } = body;

        const payload: any = { name, category, language, components };
        if (parameter_format === "NAMED" || parameter_format === "POSITIONAL") payload.parameter_format = parameter_format;
        if (allow_category_change) payload.allow_category_change = true;

        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates?x=1${proofParam}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        const data = await res.json();

        if (!res.ok) {
          console.error("[MetaTemplates] Create error:", data);
          return new Response(JSON.stringify({ error: data.error?.message || "Erro ao criar template" }), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update": {
        const { template_id, components: updateComponents, parameter_format } = body;
        const updatePayload: Record<string, unknown> = { components: updateComponents };
        if (parameter_format === "NAMED" || parameter_format === "POSITIONAL") updatePayload.parameter_format = parameter_format;

        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${template_id}?x=1${proofParam}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatePayload),
          }
        );
        const data = await res.json();

        if (!res.ok) {
          console.error("[MetaTemplates] Update error:", data);
          return new Response(JSON.stringify({ error: data.error?.message || "Erro ao atualizar template" }), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, ...data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const { template_name } = body;

        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates?name=${template_name}${proofParam}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const data = await res.json();

        if (!res.ok) {
          console.error("[MetaTemplates] Delete error:", data);
          return new Response(JSON.stringify({ error: data.error?.message || "Erro ao deletar template" }), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "analytics": {
        const { template_ids, start_date, end_date } = body;
        
        // Template analytics endpoint
        const analyticsFields = "sent,delivered,read,clicks,url_clicks";
        let url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}?fields=template_analytics.start(${start_date}).end(${end_date}).granularity(DAILY).template_ids(${template_ids.join(",")}).types(${analyticsFields})${proofParam}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();

        if (!res.ok) {
          console.error("[MetaTemplates] Analytics error:", data);
          // Analytics may not be available for all accounts, return empty
          return new Response(JSON.stringify({ template_analytics: { data: [] } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("[MetaTemplates] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
