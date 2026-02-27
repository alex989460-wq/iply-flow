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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { username, new_due_date, customer_id } = await req.json();

    if (!username || !new_due_date) {
      return new Response(
        JSON.stringify({ error: 'Username e nova data de vencimento são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAdmin = serviceRoleKey
      ? createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

    let chargedAccessId: string | null = null;
    let chargedCreditsAmount = 0;
    let chargedSource: 'backend' | 'xui' | null = null;
    let externalRefund: { tableName: string; balanceColumn: string; whereColumn: string; whereValue: string | number } | null = null;

    try {
      const expDateString = `${new_due_date} 23:59:59`;
      const normalizedUsername = String(username).trim();

      const [tablesResult] = await connection.query(`SHOW TABLES`);
      const tablesRows = tablesResult as any[];
      const tableFieldName = Object.keys(tablesRows[0] || {})[0];
      const allTables = tableFieldName ? tablesRows.map((row) => String(row[tableFieldName])) : [];

      const preferredTables = ['users', 'user', 'lines', 'clientes', 'clients', 'accounts'];
      const orderedTables = Array.from(new Set([
        ...preferredTables.filter((table) => allTables.includes(table)),
        ...allTables,
      ]));

      let foundTable = '';
      let foundUser: any = null;
      let foundColumns = new Set<string>();
      let foundColumnMeta = new Map<string, any>();
      let identifierColumnsUsed: string[] = [];

      for (const rawTableName of orderedTables) {
        const tableName = rawTableName.replace(/`/g, '');
        const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
        const columnsArray = columnsResult as any[];
        const tableColumns = new Set(columnsArray.map((col) => String(col.Field)));
        const columnMeta = new Map(columnsArray.map((col) => [String(col.Field), col]));

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
          queryParams,
        );

        const users = rows as any[];
        if (users && users.length > 0) {
          foundTable = tableName;
          foundUser = users[0];
          foundColumns = tableColumns;
          foundColumnMeta = columnMeta;
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
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Sempre descontar créditos do responsável pela conta antes de renovar
      if (customer_id) {
        let creditsToDeduct = 1;

        if (supabaseAdmin) {
          const { data: customerData, error: customerError } = await supabaseAdmin
            .from('customers')
            .select('id, created_by, plan_id')
            .eq('id', customer_id)
            .maybeSingle();

          if (customerError) {
            throw new Error(`Erro ao validar cliente para crédito: ${customerError.message}`);
          }

          if (customerData?.plan_id) {
            const { data: planData } = await supabaseAdmin
              .from('plans')
              .select('duration_days')
              .eq('id', customerData.plan_id)
              .maybeSingle();

            if (planData?.duration_days) {
              creditsToDeduct = Math.max(1, Math.round(planData.duration_days / 30));
            }
          }

          if (customerData?.created_by) {
            const { data: ownerAccess, error: ownerAccessError } = await supabaseAdmin
              .from('reseller_access')
              .select('id, credits')
              .eq('user_id', customerData.created_by)
              .maybeSingle();

            if (ownerAccessError) {
              throw new Error(`Erro ao buscar créditos do revendedor: ${ownerAccessError.message}`);
            }

            if (ownerAccess) {
              if ((ownerAccess.credits ?? 0) < creditsToDeduct) {
                throw new Error(`Créditos insuficientes. Necessário: ${creditsToDeduct}, disponível: ${ownerAccess.credits ?? 0}`);
              }

              const newCredits = ownerAccess.credits - creditsToDeduct;
              const { error: deductError } = await supabaseAdmin
                .from('reseller_access')
                .update({ credits: newCredits })
                .eq('id', ownerAccess.id);

              if (deductError) {
                throw new Error(`Erro ao descontar crédito: ${deductError.message}`);
              }

              chargedAccessId = ownerAccess.id;
              chargedCreditsAmount = creditsToDeduct;
              chargedSource = 'backend';
              console.log(`[XUI-Renew] ${creditsToDeduct} crédito(s) descontado(s) no backend do responsável ${customerData.created_by}. Saldo: ${newCredits}`);
            }
          }
        }

        // Fallback: quando o responsável não existe no backend, desconta no próprio painel XUI
        if (!chargedAccessId) {
          // XUI típico: lines tem member_id/admin_id apontando para users.id
          const ownerIdColumnCandidates = ['member_id', 'admin_id', 'user_id', 'uid', 'owner_id', 'reseller_id', 'seller_id', 'created_by', 'bouquet'];

          const ownerIdColumn = ownerIdColumnCandidates.find((c) => {
            if (!foundColumns.has(c)) return false;
            const val = foundUser?.[c];
            return val !== undefined && val !== null && val !== 0 && val !== '' && String(val).trim() !== '';
          });

          const ownerIdValue = ownerIdColumn ? foundUser[ownerIdColumn] : null;

          console.log(`[XUI-Renew] Fallback XUI: foundTable=${foundTable}, ownerIdColumn=${ownerIdColumn}, ownerIdValue=${ownerIdValue}`);
          console.log(`[XUI-Renew] Fallback XUI: foundUser keys=${Object.keys(foundUser || {}).join(', ')}`);

          // Search for the owner in the XUI database
          const preferredOwnerTables = ['users', 'user', 'resellers', 'accounts', 'admins'];
          const ownerTables = Array.from(new Set([
            ...preferredOwnerTables.filter((t) => allTables.includes(t)),
            ...allTables,
          ]));

          let xuiCreditDebited = false;

          for (const rawTableName of ownerTables) {
            if (rawTableName === foundTable) continue; // skip same table as the client
            const tableName = rawTableName.replace(/`/g, '');
            const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
            const columnsArray = columnsResult as any[];
            const tableColumns = new Set(columnsArray.map((col) => String(col.Field)));

            const balanceColumn = ['credits', 'credit', 'balance', 'wallet', 'money', 'saldo']
              .find((c) => tableColumns.has(c));
            if (!balanceColumn) continue;

            const whereClauses: string[] = [];
            const queryParams: Array<string | number> = [];

            // Match by owner ID → table's id column
            if (ownerIdValue !== null && ownerIdValue !== undefined) {
              if (tableColumns.has('id')) {
                whereClauses.push('`id` = ?');
                queryParams.push(ownerIdValue as string | number);
              }
            }

            if (whereClauses.length === 0) continue;

            const [ownerRows] = await connection.execute(
              `SELECT * FROM \`${tableName}\` WHERE ${whereClauses.join(' OR ')} LIMIT 1`,
              queryParams,
            );

            const owners = ownerRows as any[];
            if (!owners.length) continue;

            const ownerRow = owners[0];
            const currentCredits = Number(ownerRow[balanceColumn]);
            if (!Number.isFinite(currentCredits)) continue;

            const ownerName = ownerRow.username || ownerRow.user_name || ownerRow.login || ownerRow.name || ownerRow.id;
            console.log(`[XUI-Renew] Revendedor XUI encontrado: ${tableName}.${balanceColumn}, id=${ownerRow.id}, nome=${ownerName}, créditos=${currentCredits}`);

            if (currentCredits < creditsToDeduct) {
              throw new Error(`Créditos insuficientes no painel XUI para ${ownerName}. Necessário: ${creditsToDeduct}, disponível: ${currentCredits}`);
            }

            const newCredits = currentCredits - creditsToDeduct;

            await connection.execute(
              `UPDATE \`${tableName}\` SET \`${balanceColumn}\` = ? WHERE \`id\` = ? LIMIT 1`,
              [newCredits, ownerRow.id],
            );

            chargedCreditsAmount = creditsToDeduct;
            chargedSource = 'xui';
            externalRefund = { tableName, balanceColumn, whereColumn: 'id', whereValue: ownerRow.id as string | number };
            xuiCreditDebited = true;

            console.log(`[XUI-Renew] ${creditsToDeduct} crédito(s) descontado(s) no XUI (${tableName}.${balanceColumn}) de ${ownerName}. Saldo: ${newCredits}`);
            break;
          }

          if (!xuiCreditDebited) {
            console.warn(`[XUI-Renew] Não foi possível encontrar revendedor no XUI. Renovação prossegue sem desconto de crédito.`);
          }
        }
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

      const expiryColumnType = String(foundColumnMeta.get(expiryColumn)?.Type || '').toLowerCase();
      const shouldUseUnix = /(int|bigint|tinyint|smallint|mediumint|decimal|numeric)/.test(expiryColumnType);
      const expDateValue = shouldUseUnix
        ? Math.floor(new Date(`${new_due_date}T23:59:59-03:00`).getTime() / 1000)
        : expDateString;

      const updateParts = [`\`${expiryColumn}\` = ?`];
      if (foundColumns.has('enabled')) updateParts.push('enabled = 1');
      if (foundColumns.has('is_trial')) updateParts.push('is_trial = 0');

      let updateSql = '';
      let updateParams: Array<string | number> = [expDateValue as string | number];

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
      console.log(`[XUI-Renew] Usuário encontrado: tabela=${foundTable}, ID=${foundUser.id}, coluna expiração=${expiryColumn}, tipo=${expiryColumnType}, valor atual=${oldExpiration}`);
      console.log(`[XUI-Renew] Usuário ${normalizedUsername} renovado com sucesso até ${new_due_date}`);
      await connection.end();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Usuário ${normalizedUsername} renovado no servidor até ${new_due_date}`,
          table: foundTable,
          xui_user_id: foundUser.id,
          expiration_column: expiryColumn,
          expiration_column_type: expiryColumnType,
          old_exp_date: oldExpiration,
          new_exp_date: expDateValue,
          credit_charged: chargedCreditsAmount > 0,
          credits_debited: chargedCreditsAmount,
          credit_source: chargedSource,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (dbError) {
      // Reembolso de crédito no backend em caso de falha após desconto
      if (chargedAccessId && supabaseAdmin) {
        try {
          const { data: accessData } = await supabaseAdmin
            .from('reseller_access')
            .select('credits')
            .eq('id', chargedAccessId)
            .maybeSingle();

          if (accessData) {
            await supabaseAdmin
              .from('reseller_access')
              .update({ credits: (accessData.credits ?? 0) + chargedCreditsAmount })
              .eq('id', chargedAccessId);
          }
        } catch (refundError) {
          console.error('[XUI-Renew] Erro ao reembolsar crédito no backend:', refundError);
        }
      }

      // Reembolso de crédito no XUI em caso de falha após desconto
      if (externalRefund) {
        try {
          const [rows] = await connection.execute(
            `SELECT \`${externalRefund.balanceColumn}\` FROM \`${externalRefund.tableName}\` WHERE \`${externalRefund.whereColumn}\` = ? LIMIT 1`,
            [externalRefund.whereValue],
          );

          const currentRow = (rows as any[])[0];
          if (currentRow) {
            const currentValue = Number(currentRow[externalRefund.balanceColumn]);
            if (Number.isFinite(currentValue)) {
              await connection.execute(
                `UPDATE \`${externalRefund.tableName}\` SET \`${externalRefund.balanceColumn}\` = ? WHERE \`${externalRefund.whereColumn}\` = ? LIMIT 1`,
                [currentValue + chargedCreditsAmount, externalRefund.whereValue],
              );
            }
          }
        } catch (refundError) {
          console.error('[XUI-Renew] Erro ao reembolsar crédito no XUI:', refundError);
        }
      }

      await connection.end();
      throw dbError;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[XUI-Renew] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar no servidor: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
