import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v21.0";

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

    // Get Meta credentials - first try user's own settings, then any meta_cloud settings
    let { data: zapSettings } = await supabase
      .from("zap_responder_settings")
      .select("meta_access_token, meta_business_id")
      .eq("user_id", user.id)
      .not("meta_access_token", "is", null)
      .not("meta_business_id", "is", null)
      .single();

    // If user doesn't have Meta credentials, find any account that does (admin scenario)
    if (!zapSettings?.meta_access_token || !zapSettings?.meta_business_id) {
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
      }
    }

    if (!zapSettings?.meta_access_token || !zapSettings?.meta_business_id) {
      return new Response(
        JSON.stringify({ error: "Meta Cloud API não configurada. Conecte sua conta Meta primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = zapSettings.meta_access_token;
    let wabaId = zapSettings.meta_business_id;

    // Generate appsecret_proof
    const appSecret = Deno.env.get("META_APP_SECRET");
    let appsecretProof = "";
    if (appSecret) {
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

    switch (action) {
      case "list": {
        const { limit = 100 } = body;
        const fields = "id,name,status,category,language,components,quality_score,message_send_ttl_seconds";

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
        const { file_base64, file_name, file_size, mime_type } = body;
        const appId = Deno.env.get("META_APP_ID");
        if (!appId) {
          return new Response(JSON.stringify({ error: "META_APP_ID não configurado" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!uploadFile && (!file_base64 || !file_size || !mime_type)) return json({ error: "Dados de upload incompletos" }, 400);
        try {
          const resolvedName = uploadFile?.name || file_name || "upload";
          const resolvedSize = uploadFile?.size || Number(file_size || 0);
          const resolvedMime = uploadFile?.type || mime_type || "application/octet-stream";
          const headerType = String(body.header_type || "").toUpperCase();
          const maxSize = headerType === "IMAGE" || resolvedMime.startsWith("image/")
            ? 5 * 1024 * 1024
            : headerType === "VIDEO" || resolvedMime.startsWith("video/")
              ? 16 * 1024 * 1024
              : 20 * 1024 * 1024;
          if (!resolvedSize || resolvedSize > maxSize) {
            return json({ error: `Arquivo inválido ou acima do limite de ${Math.round(maxSize / 1024 / 1024)}MB` }, 400);
          }

          // App access token (more reliable for /APP_ID/uploads than user token)
          const appAccessToken = appSecret ? `${appId}|${appSecret}` : accessToken;
          const sessionUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads?file_name=${encodeURIComponent(resolvedName)}&file_length=${resolvedSize}&file_type=${encodeURIComponent(resolvedMime)}&access_token=${encodeURIComponent(appAccessToken)}`;
          const sessRes = await fetchWithTimeout(sessionUrl, { method: "POST" }, 25_000);
          const sessData = await sessRes.json();
          console.log("[MetaTemplates] Upload session:", sessRes.status, JSON.stringify(sessData).slice(0, 400));
          if (!sessRes.ok || !sessData?.id) {
            const msg = sessData?.error?.message || sessData?.error?.error_user_msg || `Falha ao iniciar upload (status ${sessRes.status})`;
            return json({ error: msg, details: sessData?.error }, 400);
          }
          let bytes: Uint8Array;
          if (uploadFile) {
            bytes = new Uint8Array(await uploadFile.arrayBuffer());
          } else {
            const binStr = atob(file_base64);
            bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          }

          const upRes = await fetchWithTimeout(`https://graph.facebook.com/${GRAPH_API_VERSION}/${sessData.id}`, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${appAccessToken}`,
              file_offset: "0",
              "Content-Type": resolvedMime,
            },
            body: bytes,
          }, 35_000);
          const upText = await upRes.text();
          let upData: any = {};
          try { upData = JSON.parse(upText); } catch { /* not json */ }
          console.log("[MetaTemplates] Upload result:", upRes.status, upText.slice(0, 400));
          if (!upRes.ok || !upData?.h) {
            const msg = upData?.error?.message || upData?.error?.error_user_msg || `Falha ao enviar arquivo (status ${upRes.status})`;
            return json({ error: msg, details: upData?.error || upText.slice(0, 300) }, 400);
          }
          return json({ header_handle: upData.h });
        } catch (e: any) {
          console.error("[MetaTemplates] Upload exception:", e);
          const isAbort = e?.name === "AbortError";
          return json({ error: isAbort ? "Tempo esgotado ao enviar mídia para a Meta. Tente um arquivo menor." : e?.message || "Erro no upload" }, isAbort ? 504 : 500);
        }
      }

      case "create": {
        const { name, category, language, components, allow_category_change } = body;

        const payload: any = { name, category, language, components };
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
        const { template_id, components: updateComponents } = body;

        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${template_id}?x=1${proofParam}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ components: updateComponents }),
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
