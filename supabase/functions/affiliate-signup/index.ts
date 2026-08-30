// Auto-cadastro público de revendas através do código/link de afiliação.
// POST { action: "resolve", code }  -> { ok, reseller_name, trial_days }
// POST { action: "signup", code, full_name, email, password } -> cria a conta como sub-revenda
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || "resolve");
    const rawCode = String(body.code || "").trim().toUpperCase();
    if (!rawCode) return json({ success: false, error: "Código do revendedor é obrigatório" }, 400);

    const { data: parent } = await admin
      .from("reseller_access")
      .select("user_id, full_name, email, is_active, access_expires_at")
      .eq("affiliate_code", rawCode)
      .maybeSingle();

    if (!parent) return json({ success: false, error: "Código de afiliação inválido" }, 404);
    if (parent.is_active === false) {
      return json({ success: false, error: "Este revendedor está com o acesso inativo" }, 403);
    }

    const { data: settings } = await admin
      .from("platform_settings")
      .select("trial_days, require_email_confirmation")
      .is("user_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const trialDays = Math.max(1, Number(settings?.trial_days) || 7);
    const requireEmailConfirmation = Boolean(settings?.require_email_confirmation);

    const resellerName = parent.full_name || String(parent.email || "").split("@")[0];

    if (action === "resolve") {
      return json({ success: true, reseller_name: resellerName, trial_days: trialDays });
    }

    if (action !== "signup") return json({ success: false, error: "Ação inválida" }, 400);

    const full_name = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (full_name.length < 2) return json({ success: false, error: "Informe seu nome completo" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ success: false, error: "E-mail inválido" }, 400);
    if (password.length < 6) return json({ success: false, error: "Senha deve ter no mínimo 6 caracteres" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: !requireEmailConfirmation,
      user_metadata: { full_name },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message || "Erro ao criar conta";
      return json(
        { success: false, error: /already been registered|already registered/i.test(msg) ? "Este e-mail já está cadastrado" : msg },
        400,
      );
    }

    const newUserId = created.user.id;
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + trialDays);

    // Aguarda o trigger padrão que cria o reseller_access
    await new Promise((r) => setTimeout(r, 600));

    const { error: updErr } = await admin
      .from("reseller_access")
      .update({
        full_name,
        email,
        access_expires_at: expiration.toISOString(),
        is_active: true,
        parent_reseller_id: parent.user_id,
        credits: 0,
      })
      .eq("user_id", newUserId);

    if (updErr) {
      const { error: insErr } = await admin.from("reseller_access").insert({
        user_id: newUserId,
        email,
        full_name,
        access_expires_at: expiration.toISOString(),
        is_active: true,
        parent_reseller_id: parent.user_id,
        credits: 0,
      });
      if (insErr) {
        console.error("[affiliate-signup] access insert failed", insErr);
        return json({ success: false, error: "Erro ao configurar o acesso da nova revenda" }, 400);
      }
    }

    let emailConfirmationSent = false;
    if (requireEmailConfirmation) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/auth-security`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ action: "send-code", email, purpose: "activation" }),
        });
        const respBody = await resp.json().catch(() => ({}));
        emailConfirmationSent = respBody?.success === true;
      } catch (mailErr) {
        console.error("[affiliate-signup] activation email failed", mailErr);
      }
    }

    return json({
      success: true,
      user_id: newUserId,
      trial_days: trialDays,
      reseller_name: resellerName,
      requires_email_confirmation: requireEmailConfirmation,
      email_confirmation_sent: emailConfirmationSent,
    });
  } catch (err) {
    console.error("[affiliate-signup]", err);
    return json({ success: false, error: err instanceof Error ? err.message : "Erro" }, 500);
  }
});
