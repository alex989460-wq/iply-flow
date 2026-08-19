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

    const { bridge_token, session_token, sigma_user, url } = await req.json();

    if (!bridge_token || !session_token) {
      return new Response(JSON.stringify({ error: "Missing tokens" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Busca a conexão pelo bridge_token temporário
    const { data: connection, error: fetchError } = await supabase
      .from("sigma_panel_connections")
      .select("id, base_url")
      .eq("bridge_token", bridge_token)
      .maybeSingle();

    if (fetchError || !connection) {
      return new Response(JSON.stringify({ error: "Chave da ponte inválida ou expirada. Gere uma nova no painel." }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Se o usuário capturou de uma URL diferente da configurada, atualizamos para garantir consistência
    const finalUrl = url || connection.base_url;

    // Atualiza com o token real de sessão e metadados
    const { error: updateError } = await supabase
      .from("sigma_panel_connections")
      .update({
        bridge_token: session_token,
        last_bridge_seen_at: new Date().toISOString(),
        base_url: finalUrl,
        // Armazena metadados do usuário sigma se for útil para debug futuro
        name: sigma_user?.username ? `Sigma: ${sigma_user.username}` : undefined
      })
      .eq("id", connection.id);

    if (updateError) throw updateError;

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