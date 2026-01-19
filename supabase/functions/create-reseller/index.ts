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
    const { email, password, full_name, access_days } = await req.json();

    if (!email || !password || !full_name || !access_days) {
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

    // Create user in auth.users
    const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (createUserError) {
      console.error("Error creating user:", createUserError);
      if (createUserError.message.includes("already been registered")) {
        throw new Error("Este email já está cadastrado");
      }
      throw new Error(createUserError.message);
    }

    if (!userData.user) {
      throw new Error("Erro ao criar usuário");
    }

    const userId = userData.user.id;

    // Calculate expiration date
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + access_days);

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

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId,
        message: "Revendedor criado com sucesso" 
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
