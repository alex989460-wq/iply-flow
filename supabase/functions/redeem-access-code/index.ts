import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const { code, email, password } = await req.json();
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) throw new Error("Código obrigatório");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve user — either from auth header or from email+password
    let userId: string | null = null;
    let userEmail: string | null = null;
    let userName: string | null = null;

    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (u?.user) {
        userId = u.user.id;
        userEmail = u.user.email ?? null;
        userName = (u.user.user_metadata?.full_name as string) ?? null;
      }
    }

    if (!userId && email && password) {
      const { data: signIn, error: siErr } = await admin.auth.signInWithPassword({ email, password });
      if (siErr || !signIn.user) throw new Error("Email ou senha incorretos");
      userId = signIn.user.id;
      userEmail = signIn.user.email ?? email;
      userName = (signIn.user.user_metadata?.full_name as string) ?? null;
    }

    if (!userId) throw new Error("Autenticação necessária para resgatar código");

    // Find code (unused)
    const { data: codeRow, error: codeErr } = await admin
      .from("reseller_access_codes")
      .select("*")
      .eq("code", cleanCode)
      .is("used_by", null)
      .maybeSingle();

    if (codeErr) throw new Error(codeErr.message);
    if (!codeRow) throw new Error("Código inválido ou já utilizado");

    const days = codeRow.days || 30;

    // Get current access (if any)
    const { data: existing } = await admin
      .from("reseller_access")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const baseDate = (() => {
      if (existing?.access_expires_at) {
        const d = new Date(existing.access_expires_at);
        return d > new Date() ? d : new Date();
      }
      return new Date();
    })();
    const newExpires = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    if (existing) {
      const { error: updErr } = await admin
        .from("reseller_access")
        .update({ access_expires_at: newExpires.toISOString(), is_active: true })
        .eq("user_id", userId);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await admin.from("reseller_access").insert({
        user_id: userId,
        email: userEmail ?? "",
        full_name: userName,
        access_expires_at: newExpires.toISOString(),
        is_active: true,
      });
      if (insErr) throw new Error(insErr.message);
    }

    // Mark code as used
    await admin
      .from("reseller_access_codes")
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq("id", codeRow.id);

    return new Response(
      JSON.stringify({ success: true, days, new_expires_at: newExpires.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
