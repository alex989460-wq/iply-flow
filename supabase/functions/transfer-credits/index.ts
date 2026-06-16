import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) throw new Error("Não autorizado");
    const currentUserId = userData.user.id;

    const { data: isAdminResult } = await supabaseClient.rpc("is_admin");
    const isAdmin = isAdminResult === true;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { sub_reseller_id, credits } = await req.json();
    const amount = parseInt(credits);
    if (!sub_reseller_id || isNaN(amount) || amount < 1) {
      throw new Error("Parâmetros inválidos");
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("reseller_access")
      .select("id, credits, parent_reseller_id")
      .eq("id", sub_reseller_id)
      .single();
    if (subErr || !sub) throw new Error("Sub-revendedor não encontrado");

    if (!isAdmin) {
      if (sub.parent_reseller_id !== currentUserId) {
        throw new Error("Você não tem permissão para enviar créditos a este revendedor");
      }
      const { data: parent, error: pErr } = await supabaseAdmin
        .from("reseller_access")
        .select("id, credits")
        .eq("user_id", currentUserId)
        .single();
      if (pErr || !parent) throw new Error("Você não possui acesso de revendedor");
      if (parent.credits < amount) {
        throw new Error(`Créditos insuficientes. Você tem ${parent.credits}`);
      }
      const { error: dErr } = await supabaseAdmin
        .from("reseller_access")
        .update({ credits: parent.credits - amount })
        .eq("id", parent.id);
      if (dErr) throw new Error("Erro ao debitar créditos");
    }

    const { error: addErr } = await supabaseAdmin
      .from("reseller_access")
      .update({ credits: (sub.credits || 0) + amount })
      .eq("id", sub_reseller_id);
    if (addErr) throw new Error("Erro ao creditar revendedor");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
