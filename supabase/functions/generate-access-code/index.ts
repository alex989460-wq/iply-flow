import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomCode(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) throw new Error("Não autorizado");
    const userId = userData.user.id;

    const { data: isAdminRes } = await userClient.rpc("is_admin");
    const isAdmin = isAdminRes === true;

    const { quantity } = await req.json();
    const qty = parseInt(String(quantity || 1));
    if (isNaN(qty) || qty < 1 || qty > 50) throw new Error("Quantidade inválida (1-50)");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // For non-admin, debit credits (1 code = 1 credit = 30 days)
    if (!isAdmin) {
      const { data: access, error: accErr } = await admin
        .from("reseller_access")
        .select("id, credits")
        .eq("user_id", userId)
        .single();
      if (accErr || !access) throw new Error("Acesso de revendedor não encontrado");
      if ((access.credits || 0) < qty)
        throw new Error(`Créditos insuficientes. Você tem ${access.credits || 0}, precisa de ${qty}.`);

      const { error: debitErr } = await admin
        .from("reseller_access")
        .update({ credits: access.credits - qty })
        .eq("id", access.id);
      if (debitErr) throw new Error("Erro ao debitar créditos");
    }

    const rows = Array.from({ length: qty }).map(() => ({
      code: randomCode(10),
      days: 30,
      created_by: userId,
    }));

    const { data: inserted, error: insErr } = await admin
      .from("reseller_access_codes")
      .insert(rows)
      .select("*");
    if (insErr) {
      // Rollback credits if non-admin
      if (!isAdmin) {
        await admin.rpc; // noop placeholder
        const { data: access2 } = await admin
          .from("reseller_access")
          .select("id, credits")
          .eq("user_id", userId)
          .single();
        if (access2)
          await admin
            .from("reseller_access")
            .update({ credits: (access2.credits || 0) + qty })
            .eq("id", access2.id);
      }
      throw new Error(insErr.message);
    }

    return new Response(JSON.stringify({ success: true, codes: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
