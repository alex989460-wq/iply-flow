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

    const rawDatabase = (Deno.env.get('XUI_MYSQL_DATABASE') || '').trim();
    const rawPort = (Deno.env.get('XUI_MYSQL_PORT') || '3306').trim();

    let database = rawDatabase;
    let port = Number.parseInt(rawPort, 10);

    // Auto-heal misconfigured secrets where DB/PORT were accidentally swapped
    if (/^\d+$/.test(rawDatabase) && !/^\d+$/.test(rawPort)) {
      console.warn('[XUI-Renew] Detectado XUI_MYSQL_DATABASE numérico e XUI_MYSQL_PORT textual; invertendo valores automaticamente');
      database = rawPort;
      port = Number.parseInt(rawDatabase, 10);
    }

    if (!database) {
      throw new Error('XUI_MYSQL_DATABASE não configurado');
    }

    if (!Number.isFinite(port)) {
      port = 3306;
    }

    const connection = await mysql.createConnection({
      host: Deno.env.get('XUI_MYSQL_HOST')!,
      user: Deno.env.get('XUI_MYSQL_USER')!,
      password: Deno.env.get('XUI_MYSQL_PASSWORD')!,
      database,
      port,
    });

    try {
      const expDate = `${new_due_date} 23:59:59`;
      const normalizedUsername = String(username).trim();

      const [tablesResult] = await connection.query(`SHOW TABLES`);
      const tablesRows = tablesResult as any[];
      const tableFieldName = Object.keys(tablesRows[0] || {})[0];
      const allTables = tableFieldName ? tablesRows.map((row) => String(row[tableFieldName])) : [];

      const preferredTables = ['users', 'user', 'clientes', 'clients', 'accounts'];
      const orderedTables = Array.from(new Set([
        ...preferredTables.filter((table) => allTables.includes(table)),
        ...allTables,
      ]));

      let foundTable = '';
      let foundUser: any = null;
      let foundColumns = new Set<string>();
      let identifierColumnsUsed: string[] = [];

      for (const rawTableName of orderedTables) {
        const tableName = rawTableName.replace(/`/g, '');
        const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
        const tableColumns = new Set((columnsResult as any[]).map((col) => String(col.Field)));

        const identifierColumns = ['username', 'user_name', 'login', 'user', 'email', 'name']
          .filter((column) => tableColumns.has(column));

        const whereClauses: string[] = [];
        const queryParams: Array<string | number> = [];

        for (const column of identifierColumns) {
          whereClauses.push(`TRIM(CAST(\`${column}\` AS CHAR)) = TRIM(?)`);
          queryParams.push(normalizedUsername);
        }

        if (/^\d+$/.test(normalizedUsername) && tableColumns.has('id')) {
          whereClauses.push('`id` = ?');
          queryParams.push(Number(normalizedUsername));
        }

        if (whereClauses.length === 0) continue;

        const [rows] = await connection.execute(
          `SELECT * FROM \`${tableName}\` WHERE ${whereClauses.join(' OR ')} LIMIT 1`,
          queryParams
        );

        const users = rows as any[];
        if (users && users.length > 0) {
          foundTable = tableName;
          foundUser = users[0];
          foundColumns = tableColumns;
          identifierColumnsUsed = identifierColumns;
          break;
        }
      }

      if (!foundUser) {
        console.log(`[XUI-Renew] Usuário não encontrado no XUI: ${normalizedUsername}`);
        await connection.end();
        return new Response(
          JSON.stringify({
            success: false,
            error: `Usuário "${normalizedUsername}" não encontrado no servidor XUI`,
            database,
            searched_tables: orderedTables.slice(0, 20),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const expiryColumnCandidates = [
        'exp_date',
        'expiration',
        'expiration_date',
        'expire_date',
        'expiry_date',
        'expires_at',
        'expire_at',
        'expiracao',
      ];

      const expiryColumn = expiryColumnCandidates.find((column) => foundColumns.has(column));

      if (!expiryColumn) {
        throw new Error(`Nenhuma coluna de expiração conhecida foi encontrada na tabela ${foundTable}`);
      }

      const updateParts = [`\`${expiryColumn}\` = ?`];
      if (foundColumns.has('enabled')) updateParts.push('enabled = 1');
      if (foundColumns.has('is_trial')) updateParts.push('is_trial = 0');

      let updateSql = '';
      let updateParams: Array<string | number> = [expDate];

      if (foundColumns.has('id') && foundUser.id !== undefined && foundUser.id !== null) {
        updateSql = `UPDATE \`${foundTable}\` SET ${updateParts.join(', ')} WHERE id = ?`;
        updateParams.push(foundUser.id);
      } else {
        const fallbackIdColumn = identifierColumnsUsed[0];
        if (!fallbackIdColumn) {
          throw new Error('Não foi possível determinar coluna para atualizar o usuário');
        }
        updateSql = `UPDATE \`${foundTable}\` SET ${updateParts.join(', ')} WHERE TRIM(CAST(\`${fallbackIdColumn}\` AS CHAR)) = TRIM(?)`;
        updateParams.push(normalizedUsername);
      }

      await connection.execute(updateSql, updateParams);

      const oldExpiration = foundUser[expiryColumn] ?? null;
      console.log(`[XUI-Renew] Usuário encontrado: tabela=${foundTable}, ID=${foundUser.id}, coluna expiração=${expiryColumn}, valor atual=${oldExpiration}`);
      console.log(`[XUI-Renew] Usuário ${normalizedUsername} renovado com sucesso até ${expDate}`);
      await connection.end();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Usuário ${normalizedUsername} renovado no servidor até ${new_due_date}`,
          table: foundTable,
          xui_user_id: foundUser.id,
          expiration_column: expiryColumn,
          old_exp_date: oldExpiration,
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
