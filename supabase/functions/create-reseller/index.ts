import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get the authorization header to verify the caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Não autorizado");
    }

    // Create client with user's token to check if they're admin
    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Check if the calling user is admin
    const { data: isAdminResult, error: adminCheckError } = await supabaseClient.rpc('is_admin');
    
    if (adminCheckError || !isAdminResult) {
      throw new Error("Apenas administradores podem criar revendedores");
    }

    // Parse request body
    const { email, password, full_name } = await req.json();

    if (!email || !password || !full_name) {
      throw new Error("Todos os campos são obrigatórios");
    }

    if (password.length < 6) {
      throw new Error("Senha deve ter no mínimo 6 caracteres");
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: platformSettings, error: settingsError } = await supabaseAdmin
      .from('platform_settings')
      .select('trial_days, require_email_confirmation')
      .is('user_id', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error("Error loading global trial days:", settingsError);
      throw new Error("Não foi possível carregar os dias grátis configurados");
    }

    const accessDays = Math.max(0, Number(platformSettings?.trial_days ?? 7));

    const requireEmailConfirmation = Boolean(platformSettings?.require_email_confirmation);

    // Create user in auth.users
    const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: !requireEmailConfirmation,
      user_metadata: {
        full_name,
      },
    });

    if (createUserError) {
      console.error("Error creating user:", createUserError);
      if (createUserError.message.includes("already been registered")) {
        throw new Error("Este email já está cadastrado");
      }
      throw new Error(
        createUserError.message && createUserError.message !== '{}'
          ? createUserError.message
          : "O serviço de autenticação não conseguiu criar a conta. Tente novamente."
      );
    }

    if (!userData.user) {
      throw new Error("Erro ao criar usuário");
    }

    const userId = userData.user.id;

    // Calculate expiration date
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + accessDays);

    // The profile and reseller_access should be created automatically by triggers
    // But let's ensure they exist with correct values

    // Wait a moment for triggers to fire
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update reseller_access with correct expiration
    const { error: updateAccessError } = await supabaseAdmin
      .from('reseller_access')
      .update({ 
        access_expires_at: expirationDate.toISOString(),
        full_name: full_name,
      })
      .eq('user_id', userId);

    if (updateAccessError) {
      console.error("Error updating reseller_access:", updateAccessError);
      // The trigger might not have fired yet, so let's insert manually
      const { error: insertAccessError } = await supabaseAdmin
        .from('reseller_access')
        .insert({
          user_id: userId,
          email: email,
          full_name: full_name,
          access_expires_at: expirationDate.toISOString(),
          is_active: true,
        });

      if (insertAccessError) {
        console.error("Error inserting reseller_access:", insertAccessError);
        throw new Error("Erro ao configurar acesso do revendedor");
      }
    }

    // --- Confirmação de e-mail (código de ativação) ---
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
        console.error("Activation email failed:", mailErr);
      }
    }

    // --- Integração CRM Oficial (não-bloqueante) ---
    let crmCreated = false;
    let crmError: string | null = null;
    try {
      const { data: callerUser } = await supabaseClient.auth.getUser();
      const callerId = callerUser?.user?.id;
      if (callerId) {
        const { data: crmCfg } = await supabaseAdmin
          .from('crm_oficial_settings')
          .select('enabled, auto_signup, auto_test_chat, api_key')
          .eq('user_id', callerId)
          .maybeSingle();
        if (crmCfg?.enabled && crmCfg.api_key) {
          const crmUrl = `${supabaseUrl}/functions/v1/crm-oficial-sync`;
          const headers = { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` };
          {
            const crmResp = await fetch(crmUrl, { method: "POST", headers, body: JSON.stringify({ action: "signup", data: { email, password, full_name, apiKey: crmCfg.api_key, local_user_id: userId } }) });
            const crmBody = await crmResp.json().catch(() => ({}));
            crmCreated = crmBody?.results?.signup?.ok === true || crmBody?.results?.api_key?.ok === true || crmBody?.success === true;
            if (!crmCreated) {
              crmError = crmBody?.results?.signup?.body?.error || crmBody?.error || 'Falha ao criar conta no ZapCRM';
            }
          }
          if (crmCfg.auto_test_chat) {
            const fakePhone = `5500${Date.now().toString().slice(-9)}`;
            await fetch(crmUrl, { method: "POST", headers, body: JSON.stringify({ action: "test-chat", data: { name: full_name, phone: fakePhone, email, apiKey: crmCfg.api_key } }) });
          }
        }
      }
    } catch (crmErr) {
      console.error("CRM Oficial sync failed (ignored):", crmErr);
      crmError = (crmErr as Error).message;
    }



    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId,
        crm_created: crmCreated,
        crm_error: crmError,
        email_confirmation_sent: emailConfirmationSent,
        message: requireEmailConfirmation
          ? "Revendedor criado. Código de ativação enviado por e-mail."
          : "Revendedor criado com sucesso" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error("Error in create-reseller function:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400 
      }
    );
  }
});
