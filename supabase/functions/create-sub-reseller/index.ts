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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the authorization header to verify the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Não autorizado");
    }

    // Create client with user's token to check their identity
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      throw new Error("Não autorizado");
    }

    const currentUserId = claimsData.claims.sub as string;
    console.log("Current user ID:", currentUserId);

    // Check if the calling user is admin
    const { data: isAdminResult } = await supabaseClient.rpc('is_admin');
    const isAdmin = isAdminResult === true;

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Parse request body
    const { email, password, full_name, credits_to_use } = await req.json();

    if (!email || !password || !full_name || !credits_to_use) {
      throw new Error("Todos os campos são obrigatórios");
    }

    if (password.length < 6) {
      throw new Error("Senha deve ter no mínimo 6 caracteres");
    }

    const creditsNeeded = parseInt(credits_to_use);
    if (isNaN(creditsNeeded) || creditsNeeded < 1) {
      throw new Error("Créditos inválidos");
    }

    // If not admin, check if user has enough credits
    if (!isAdmin) {
      const { data: parentAccess, error: parentError } = await supabaseAdmin
        .from('reseller_access')
        .select('id, credits')
        .eq('user_id', currentUserId)
        .single();

      if (parentError || !parentAccess) {
        console.error("Error fetching parent access:", parentError);
        throw new Error("Você não possui acesso de revendedor");
      }

      if (parentAccess.credits < creditsNeeded) {
        throw new Error(`Créditos insuficientes. Você tem ${parentAccess.credits} créditos, mas precisa de ${creditsNeeded}`);
      }

      // Deduct credits from parent
      const { error: deductError } = await supabaseAdmin
        .from('reseller_access')
        .update({ credits: parentAccess.credits - creditsNeeded })
        .eq('id', parentAccess.id);

      if (deductError) {
        console.error("Error deducting credits:", deductError);
        throw new Error("Erro ao deduzir créditos");
      }
    }

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
      
      // Refund credits if user creation failed (for non-admin)
      if (!isAdmin) {
        const { data: parentAccess } = await supabaseAdmin
          .from('reseller_access')
          .select('id, credits')
          .eq('user_id', currentUserId)
          .single();
        
        if (parentAccess) {
          await supabaseAdmin
            .from('reseller_access')
            .update({ credits: parentAccess.credits + creditsNeeded })
            .eq('id', parentAccess.id);
        }
      }
      
      if (createUserError.message.includes("already been registered")) {
        throw new Error("Este email já está cadastrado");
      }
      throw new Error(createUserError.message);
    }

    if (!userData.user) {
      throw new Error("Erro ao criar usuário");
    }

    const newUserId = userData.user.id;

    // Calculate expiration date based on credits (1 credit = 30 days)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (creditsNeeded * 30));

    // Wait a moment for triggers to fire
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update or insert reseller_access with correct values
    const { error: updateAccessError } = await supabaseAdmin
      .from('reseller_access')
      .update({ 
        access_expires_at: expirationDate.toISOString(),
        full_name: full_name,
        parent_reseller_id: isAdmin ? null : currentUserId,
        credits: 0, // New sub-resellers start with 0 credits
      })
      .eq('user_id', newUserId);

    if (updateAccessError) {
      console.log("Update failed, trying insert:", updateAccessError);
      // The trigger might not have fired yet, so insert manually
      const { error: insertAccessError } = await supabaseAdmin
        .from('reseller_access')
        .insert({
          user_id: newUserId,
          email: email,
          full_name: full_name,
          access_expires_at: expirationDate.toISOString(),
          is_active: true,
          parent_reseller_id: isAdmin ? null : currentUserId,
          credits: 0,
        });

      if (insertAccessError) {
        console.error("Error inserting reseller_access:", insertAccessError);
        throw new Error("Erro ao configurar acesso do sub-revendedor");
      }
    }

    console.log("Sub-reseller created successfully:", newUserId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: newUserId,
        message: "Sub-revendedor criado com sucesso" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error("Error in create-sub-reseller function:", error);
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
