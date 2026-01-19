import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify they are admin
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated and is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Failed to get claims:', claimsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    // Check if user is admin
    const { data: adminRole } = await supabaseUser
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      console.error('User is not admin:', userId);
      return new Response(
        JSON.stringify({ success: false, error: 'Apenas administradores podem alterar senhas' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { targetUserId, newPassword } = await req.json();

    if (!targetUserId || !newPassword) {
      console.error('Missing required fields');
      return new Response(
        JSON.stringify({ success: false, error: 'ID do usuário e nova senha são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (newPassword.length < 6) {
      console.error('Password too short');
      return new Response(
        JSON.stringify({ success: false, error: 'A senha deve ter no mínimo 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Update user password
    console.log('Updating password for user:', targetUserId);
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Password updated successfully for user:', targetUserId);
    return new Response(
      JSON.stringify({ success: true, message: 'Senha atualizada com sucesso' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
