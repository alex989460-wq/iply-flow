import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v21.0";

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

    const body = await req.json();
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
        if (!file_base64 || !file_size || !mime_type) {
          return new Response(JSON.stringify({ error: "Dados de upload incompletos" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        try {
          const sessionUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads?file_name=${encodeURIComponent(file_name || "upload")}&file_length=${file_size}&file_type=${encodeURIComponent(mime_type)}&access_token=${accessToken}${proofParam.replace('&','&')}`;
          const sessRes = await fetch(sessionUrl, { method: "POST" });
          const sessData = await sessRes.json();
          if (!sessRes.ok || !sessData?.id) {
            return new Response(JSON.stringify({ error: sessData?.error?.message || "Falha ao iniciar upload" }), {
              status: sessRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // Decode base64 to bytes
          const binStr = atob(file_base64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

          const upRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${sessData.id}`, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${accessToken}`,
              file_offset: "0",
            },
            body: bytes,
          });
          const upData = await upRes.json();
          if (!upRes.ok || !upData?.h) {
            return new Response(JSON.stringify({ error: upData?.error?.message || "Falha ao enviar arquivo" }), {
              status: upRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ header_handle: upData.h }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "Erro no upload" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
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
