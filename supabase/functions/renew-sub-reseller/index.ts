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

    // Create client with user's token
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
    const { sub_reseller_id, credits_to_use } = await req.json();

    if (!sub_reseller_id || !credits_to_use) {
      throw new Error("Todos os campos são obrigatórios");
    }

    const creditsNeeded = parseInt(credits_to_use);
    if (isNaN(creditsNeeded) || creditsNeeded < 1) {
      throw new Error("Créditos inválidos");
    }

    // Get the sub-reseller to verify ownership
    const { data: subReseller, error: subResellerError } = await supabaseAdmin
      .from('reseller_access')
      .select('*')
      .eq('id', sub_reseller_id)
      .single();

    if (subResellerError || !subReseller) {
      throw new Error("Sub-revendedor não encontrado");
    }

    // Verify the caller owns this sub-reseller (or is admin)
    if (!isAdmin && subReseller.parent_reseller_id !== currentUserId) {
      throw new Error("Você não tem permissão para renovar este sub-revendedor");
    }

    // If not admin, check if user has enough credits
    if (!isAdmin) {
      const { data: parentAccess, error: parentError } = await supabaseAdmin
        .from('reseller_access')
        .select('id, credits')
        .eq('user_id', currentUserId)
        .single();

      if (parentError || !parentAccess) {
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
        throw new Error("Erro ao deduzir créditos");
      }
    }

    // Calculate new expiration date
    const currentExpiration = new Date(subReseller.access_expires_at);
    const now = new Date();
    
    // If already expired, start from now; otherwise, add to current expiration
    const baseDate = currentExpiration > now ? currentExpiration : now;
    const newExpiration = new Date(baseDate);
    newExpiration.setDate(newExpiration.getDate() + (creditsNeeded * 30));

    // Update sub-reseller expiration
    const { error: updateError } = await supabaseAdmin
      .from('reseller_access')
      .update({ 
        access_expires_at: newExpiration.toISOString(),
        is_active: true,
      })
      .eq('id', sub_reseller_id);

    if (updateError) {
      // Refund credits if update failed (for non-admin)
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
      throw new Error("Erro ao renovar sub-revendedor");
    }

    console.log("Sub-reseller renewed successfully:", sub_reseller_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Sub-revendedor renovado com sucesso",
        new_expiration: newExpiration.toISOString(),
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error("Error in renew-sub-reseller function:", error);
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
