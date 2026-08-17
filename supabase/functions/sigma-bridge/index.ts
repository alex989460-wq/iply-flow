import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const bridgeToken = req.headers.get("x-bridge-token");

    // A ponte (aba do Sigma) chama este endpoint para buscar tarefas.
    // GET /sigma-bridge?action=poll
    if (req.method === "GET" && action === "poll") {
      if (!bridgeToken) return json({ error: "missing_token" }, 401);

      // Valida a ponte e descobre qual conexão ela representa
      const { data: connection } = await admin
        .from("sigma_panel_connections")
        .select("id, user_id, base_url")
        .eq("bridge_token", bridgeToken)
        .maybeSingle();

      if (!connection) return json({ error: "invalid_token" }, 401);

      // Atualiza o last_seen da ponte
      await admin.from("sigma_panel_connections").update({ last_bridge_seen_at: new Date().toISOString() }).eq("id", connection.id);

      // Busca a tarefa pendente mais antiga para este revendedor e conexão
      const { data: job } = await admin
          .from("sigma_bridge_jobs")
          .select("*")
          .eq("sigma_connection_id", connection.id)
          .eq("status", "pending")
          .lt("expires_at", new Date(Date.now() + 600000).toISOString()) // Garantia de expiração
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

      if (!job) return json({ jobs: [] });

      // Marca como processando
      await admin.from("sigma_bridge_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);

      return json({ jobs: [job] });
    }

    // A ponte chama este endpoint para devolver o resultado.
    // POST /sigma-bridge?action=complete
    if (req.method === "POST" && action === "complete") {
      if (!bridgeToken) return json({ error: "missing_token" }, 401);
      
      const { job_id, response, error } = await req.json();
      if (!job_id) return json({ error: "missing_job_id" }, 400);

      // Verifica se o token pertence ao dono da tarefa
      const { data: job } = await admin.from("sigma_bridge_jobs").select("sigma_connection_id").eq("id", job_id).maybeSingle();
      if (!job) return json({ error: "job_not_found" }, 404);

      const { data: connection } = await admin
        .from("sigma_panel_connections")
        .select("id")
        .eq("id", job.sigma_connection_id)
        .eq("bridge_token", bridgeToken)
        .maybeSingle();

      if (!connection) return json({ error: "unauthorized_bridge" }, 403);

      // Conclui a tarefa
      await admin.from("sigma_bridge_jobs").update({
        status: error ? "failed" : "completed",
        response_payload: response || null,
        error_message: error || null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);

      return json({ success: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (err) {
    console.error("[sigma-bridge]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
