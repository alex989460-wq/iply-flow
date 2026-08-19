import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { bridge_token, session_token } = await req.json();

    if (!bridge_token || !session_token) {
      return new Response(JSON.stringify({ error: "Missing tokens" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Busca a conexão pelo bridge_token
    const { data: connection, error: fetchError } = await supabase
      .from("sigma_panel_connections")
      .select("id")
      .eq("bridge_token", bridge_token)
      .maybeSingle();

    if (fetchError || !connection) {
      return new Response(JSON.stringify({ error: "Invalid bridge token" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Atualiza o bridge_token da conexão com o token real da sessão do Sigma
    // e marca a data do último sinal recebido
    const { error: updateError } = await supabase
      .from("sigma_panel_connections")
      .update({
        bridge_token: session_token, // Substitui o token temporário pelo token real de sessão
        last_bridge_seen_at: new Date().toISOString()
      })
      .eq("id", connection.id);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
