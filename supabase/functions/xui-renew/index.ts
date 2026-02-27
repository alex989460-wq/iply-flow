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

    if (/^\d+$/.test(rawDatabase) && !/^\d+$/.test(rawPort)) {
      console.warn('[XUI-Renew] Detectado swap DB/PORT; invertendo');
      database = rawPort;
      port = Number.parseInt(rawDatabase, 10);
    }

    if (!database) throw new Error('XUI_MYSQL_DATABASE não configurado');
    if (!Number.isFinite(port)) port = 3306;

    const connection = await mysql.createConnection({
      host: Deno.env.get('XUI_MYSQL_HOST')!,
      user: Deno.env.get('XUI_MYSQL_USER')!,
      password: Deno.env.get('XUI_MYSQL_PASSWORD')!,
      database,
      port,
      connectTimeout: 10000,
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

      // ─── BUSCA DIRETA nas tabelas padrão XUI/Vplay ───
      const targetTables = ['lines', 'users', 'user'];
      let foundTable = '';
      let foundUser: any = null;
      let foundColumns = new Set<string>();
      let foundColumnMeta = new Map<string, any>();

      for (const tableName of targetTables) {
        try {
          const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
          const columnsArray = columnsResult as any[];
          const tableColumns = new Set(columnsArray.map((col) => String(col.Field)));
          const columnMeta = new Map(columnsArray.map((col) => [String(col.Field), col]));

          const identifierColumns = ['username', 'user_name', 'login', 'user', 'email', 'name']
            .filter((c) => tableColumns.has(c));

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

          const results = rows as any[];
          if (results.length > 0) {
            foundTable = tableName;
            foundUser = results[0];
            foundColumns = tableColumns;
            foundColumnMeta = columnMeta;
            console.log(`[XUI-Renew] Usuário encontrado em ${tableName}, id=${foundUser.id}`);
            break;
          }
        } catch {
          // tabela não existe, continuar
        }
      }

      if (!foundUser) {
        await connection.end();
        return new Response(
          JSON.stringify({
            success: false,
            error: `Usuário "${normalizedUsername}" não encontrado no servidor XUI`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // ─── DESCONTO DE CRÉDITOS ───
      if (customer_id) {
        let creditsToDeduct = 1;

        if (supabaseAdmin) {
          const { data: customerData } = await supabaseAdmin
            .from('customers')
            .select('id, created_by, plan_id')
            .eq('id', customer_id)
            .maybeSingle();

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

          // Tentar descontar no backend
          if (customerData?.created_by) {
            const { data: ownerAccess } = await supabaseAdmin
              .from('reseller_access')
              .select('id, credits')
              .eq('user_id', customerData.created_by)
              .maybeSingle();

            if (ownerAccess) {
              if ((ownerAccess.credits ?? 0) < creditsToDeduct) {
                throw new Error(`Créditos insuficientes. Necessário: ${creditsToDeduct}, disponível: ${ownerAccess.credits ?? 0}`);
              }

              const newCredits = ownerAccess.credits - creditsToDeduct;
              const { error: deductError } = await supabaseAdmin
                .from('reseller_access')
                .update({ credits: newCredits })
                .eq('id', ownerAccess.id);

              if (deductError) throw new Error(`Erro ao descontar crédito: ${deductError.message}`);

              chargedAccessId = ownerAccess.id;
              chargedCreditsAmount = creditsToDeduct;
              chargedSource = 'backend';
              console.log(`[XUI-Renew] ${creditsToDeduct} crédito(s) descontado(s) no backend. Saldo: ${newCredits}`);
            }
          }
        }

        // Fallback: descontar no XUI (tabela users, coluna credits)
        if (!chargedAccessId) {
          const ownerIdColumn = ['member_id', 'admin_id', 'user_id', 'owner_id', 'reseller_id']
            .find((c) => foundColumns.has(c) && foundUser[c] !== undefined && foundUser[c] !== null && foundUser[c] !== 0);

          if (ownerIdColumn) {
            const ownerIdValue = foundUser[ownerIdColumn];
            const ownerTable = foundTable === 'lines' ? 'users' : 'users';

            try {
              const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${ownerTable}\``);
              const cols = new Set((columnsResult as any[]).map((c) => String(c.Field)));
              const balanceCol = ['credits', 'credit', 'balance', 'wallet', 'money', 'saldo'].find((c) => cols.has(c));

              if (balanceCol) {
                const [ownerRows] = await connection.execute(
                  `SELECT * FROM \`${ownerTable}\` WHERE \`id\` = ? LIMIT 1`,
                  [ownerIdValue],
                );
                const owners = ownerRows as any[];
                if (owners.length > 0) {
                  const ownerRow = owners[0];
                  const currentCredits = Number(ownerRow[balanceCol]);
                  if (Number.isFinite(currentCredits)) {
                    if (currentCredits < creditsToDeduct) {
                      const ownerName = ownerRow.username || ownerRow.name || ownerRow.id;
                      throw new Error(`Créditos insuficientes no XUI para ${ownerName}. Necessário: ${creditsToDeduct}, disponível: ${currentCredits}`);
                    }
                    const newCredits = currentCredits - creditsToDeduct;
                    await connection.execute(
                      `UPDATE \`${ownerTable}\` SET \`${balanceCol}\` = ? WHERE \`id\` = ? LIMIT 1`,
                      [newCredits, ownerRow.id],
                    );
                    chargedCreditsAmount = creditsToDeduct;
                    chargedSource = 'xui';
                    externalRefund = { tableName: ownerTable, balanceColumn: balanceCol, whereColumn: 'id', whereValue: ownerRow.id };
                    console.log(`[XUI-Renew] ${creditsToDeduct} crédito(s) descontado(s) no XUI (${ownerTable}.${balanceCol}). Saldo: ${newCredits}`);
                  }
                }
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes('Créditos insuficientes')) throw e;
              console.warn(`[XUI-Renew] Fallback XUI falhou:`, e);
            }
          } else {
            console.warn(`[XUI-Renew] Sem coluna de owner encontrada. Renovação prossegue sem desconto.`);
          }
        }
      }

      // ─── RENOVAÇÃO ───
      const expiryColumnCandidates = ['exp_date', 'expiration', 'expiration_date', 'expire_date', 'expiry_date', 'expires_at', 'expire_at'];
      const expiryColumn = expiryColumnCandidates.find((c) => foundColumns.has(c));

      if (!expiryColumn) {
        throw new Error(`Nenhuma coluna de expiração encontrada na tabela ${foundTable}`);
      }

      const expiryColumnType = String(foundColumnMeta.get(expiryColumn)?.Type || '').toLowerCase();
      const shouldUseUnix = /(int|bigint|tinyint|smallint|mediumint|decimal|numeric)/.test(expiryColumnType);
      const expDateValue = shouldUseUnix
        ? Math.floor(new Date(`${new_due_date}T23:59:59-03:00`).getTime() / 1000)
        : expDateString;

      const updateParts = [`\`${expiryColumn}\` = ?`];
      if (foundColumns.has('enabled')) updateParts.push('enabled = 1');
      if (foundColumns.has('is_trial')) updateParts.push('is_trial = 0');

      const updateParams: Array<string | number> = [expDateValue as string | number];

      let updateSql: string;
      if (foundColumns.has('id') && foundUser.id != null) {
        updateSql = `UPDATE \`${foundTable}\` SET ${updateParts.join(', ')} WHERE id = ?`;
        updateParams.push(foundUser.id);
      } else {
        const fallbackCol = ['username', 'user_name', 'login'].find((c) => foundColumns.has(c));
        if (!fallbackCol) throw new Error('Não foi possível determinar coluna para atualizar');
        updateSql = `UPDATE \`${foundTable}\` SET ${updateParts.join(', ')} WHERE TRIM(CAST(\`${fallbackCol}\` AS CHAR)) = TRIM(?)`;
        updateParams.push(normalizedUsername);
      }

      await connection.execute(updateSql, updateParams);

      const oldExpiration = foundUser[expiryColumn] ?? null;
      console.log(`[XUI-Renew] Renovado: ${normalizedUsername}, tabela=${foundTable}, ${expiryColumn}: ${oldExpiration} → ${expDateValue}`);
      await connection.end();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Usuário ${normalizedUsername} renovado no servidor até ${new_due_date}`,
          table: foundTable,
          xui_user_id: foundUser.id,
          expiration_column: expiryColumn,
          old_exp_date: oldExpiration,
          new_exp_date: expDateValue,
          credit_charged: chargedCreditsAmount > 0,
          credits_debited: chargedCreditsAmount,
          credit_source: chargedSource,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (dbError) {
      // Reembolso backend
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
          console.error('[XUI-Renew] Erro reembolso backend:', refundError);
        }
      }

      // Reembolso XUI
      if (externalRefund) {
        try {
          const [rows] = await connection.execute(
            `SELECT \`${externalRefund.balanceColumn}\` FROM \`${externalRefund.tableName}\` WHERE \`${externalRefund.whereColumn}\` = ? LIMIT 1`,
            [externalRefund.whereValue],
          );
          const currentRow = (rows as any[])[0];
          if (currentRow) {
            const val = Number(currentRow[externalRefund.balanceColumn]);
            if (Number.isFinite(val)) {
              await connection.execute(
                `UPDATE \`${externalRefund.tableName}\` SET \`${externalRefund.balanceColumn}\` = ? WHERE \`${externalRefund.whereColumn}\` = ? LIMIT 1`,
                [val + chargedCreditsAmount, externalRefund.whereValue],
              );
            }
          }
        } catch (refundError) {
          console.error('[XUI-Renew] Erro reembolso XUI:', refundError);
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
