import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mysql from "npm:mysql2@3.9.7/promise";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
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

    const connection = await mysql.createConnection({
      host: Deno.env.get('XUI_MYSQL_HOST')!,
      user: Deno.env.get('XUI_MYSQL_USER')!,
      password: Deno.env.get('XUI_MYSQL_PASSWORD')!,
      database: Deno.env.get('XUI_MYSQL_DATABASE')!,
      port: parseInt(Deno.env.get('XUI_MYSQL_PORT') || '3306'),
    });

    try {
      const expDate = `${new_due_date} 23:59:59`;

      const [rows] = await connection.execute(
        `SELECT id, username, exp_date FROM users WHERE username = ?`,
        [username]
      );

      const users = rows as any[];

      if (!users || users.length === 0) {
        console.log(`[XUI-Renew] Usuário não encontrado no XUI: ${username}`);
        await connection.end();
        return new Response(
          JSON.stringify({ success: false, error: `Usuário "${username}" não encontrado no servidor XUI` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const xuiUser = users[0];
      console.log(`[XUI-Renew] Usuário encontrado: ID=${xuiUser.id}, exp_date atual=${xuiUser.exp_date}`);

      await connection.execute(
        `UPDATE users SET exp_date = ?, enabled = 1, is_trial = 0 WHERE username = ?`,
        [expDate, username]
      );

      console.log(`[XUI-Renew] Usuário ${username} renovado com sucesso até ${expDate}`);
      await connection.end();

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
      await connection.end();
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
