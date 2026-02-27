import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connect } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { username, new_due_date } = await req.json();

    if (!username || !new_due_date) {
      return new Response(
        JSON.stringify({ error: 'Username e nova data de vencimento são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI-Renew] Renovando usuário: ${username}, nova data: ${new_due_date}`);

    // Connect to XUI MySQL database
    const client = await connect({
      hostname: Deno.env.get('XUI_MYSQL_HOST')!,
      username: Deno.env.get('XUI_MYSQL_USER')!,
      password: Deno.env.get('XUI_MYSQL_PASSWORD')!,
      db: Deno.env.get('XUI_MYSQL_DATABASE')!,
      port: parseInt(Deno.env.get('XUI_MYSQL_PORT') || '3306'),
    });

    try {
      // Convert date to XUI exp_date format (YYYY-MM-DD HH:MM:SS)
      const expDate = `${new_due_date} 23:59:59`;

      // Find user by username in XUI
      const users = await client.query(
        `SELECT id, username, exp_date FROM users WHERE username = ?`,
        [username]
      );

      if (!users || users.length === 0) {
        console.log(`[XUI-Renew] Usuário não encontrado no XUI: ${username}`);
        await client.close();
        return new Response(
          JSON.stringify({ success: false, error: `Usuário "${username}" não encontrado no servidor XUI` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const xuiUser = users[0];
      console.log(`[XUI-Renew] Usuário encontrado no XUI: ID=${xuiUser.id}, exp_date atual=${xuiUser.exp_date}`);

      // Update exp_date and enable user
      await client.execute(
        `UPDATE users SET exp_date = ?, enabled = 1, is_trial = 0 WHERE username = ?`,
        [expDate, username]
      );

      console.log(`[XUI-Renew] Usuário ${username} renovado com sucesso até ${expDate}`);

      await client.close();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Usuário ${username} renovado no servidor até ${new_due_date}`,
          xui_user_id: xuiUser.id,
          old_exp_date: xuiUser.exp_date,
          new_exp_date: expDate,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (dbError) {
      await client.close();
      throw dbError;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[XUI-Renew] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar no servidor: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
