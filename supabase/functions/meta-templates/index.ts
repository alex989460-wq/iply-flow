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
        const { limit = 100, after } = body;
        let url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates?limit=${limit}&fields=id,name,status,category,language,components,quality_score,message_send_ttl_seconds${proofParam}`;
        if (after) url += `&after=${after}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();

        if (!res.ok) {
          console.error("[MetaTemplates] List error:", data);
          return new Response(JSON.stringify({ error: data.error?.message || "Erro ao listar templates" }), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create": {
        const { name, category, language, components } = body;

        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates?x=1${proofParam}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name, category, language, components }),
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
        let url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}?fields=template_analytics.start(${start_date}).end(${end_date}).granularity(DAILY).template_ids(${template_ids.join(",")}).types(${analyticsFields})`;

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
