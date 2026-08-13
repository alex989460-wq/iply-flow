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
    // Support both authenticated calls and internal webhook calls
    const internalSecret = req.headers.get('x-cakto-webhook-secret');
    const configuredWebhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET');
    const isInternalWebhookCall =
      !!configuredWebhookSecret && internalSecret === configuredWebhookSecret;

    let callerId: string | null = null;

    if (!isInternalWebhookCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      callerId = user.id;
    } else {
      console.log('[VPlay] Chamada interna autorizada pelo webhook da Cakto');
    }

    const requestBody = await req.json();
    const { username, new_due_date, customer_id } = requestBody;
    const action = String(requestBody.action || 'renew');

    if (action !== 'test' && (!username || !new_due_date)) {
      return new Response(
        JSON.stringify({ error: 'Username e nova data de vencimento são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action !== 'test') console.log(`[VPlay] Renovando usuário: ${username}, nova data: ${new_due_date}`);

    // 1) Credenciais MySQL próprias do revendedor (dono do cliente ou quem chamou)
    let host = '';
    let user = '';
    let password = '';
    let database = '';
    let port = 3306;

    const serviceRoleKeyForLookup = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceRoleKeyForLookup) {
      const lookupClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKeyForLookup, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let ownerId: string | null = callerId;
      if (customer_id) {
        const { data: customerOwner } = await lookupClient
          .from('customers')
          .select('created_by')
          .eq('id', customer_id)
          .maybeSingle();
        if (customerOwner?.created_by) ownerId = customerOwner.created_by;
      }

      if (ownerId) {
        const { data: settings } = await lookupClient
          .from('reseller_api_settings')
          .select('vplay_mysql_host, vplay_mysql_port, vplay_mysql_user, vplay_mysql_password, vplay_mysql_database, vplay_panel_username, vplay_panel_password')
          .eq('user_id', ownerId)
          .maybeSingle();

        const vplay_panel_username = settings?.vplay_panel_username;
        const vplay_panel_password = settings?.vplay_panel_password;

        if (settings?.vplay_mysql_host && settings?.vplay_mysql_user && settings?.vplay_mysql_password && settings?.vplay_mysql_database) {
          host = String(settings.vplay_mysql_host).trim();
          user = String(settings.vplay_mysql_user).trim();
          password = String(settings.vplay_mysql_password);
          database = String(settings.vplay_mysql_database).trim();
          port = Number(settings.vplay_mysql_port) || 3306;
          console.log('[VPlay] Usando credenciais MySQL do revendedor');
        }
      }
    }

    // 2) Fallback: credenciais globais
    if (!host || !user || !password || !database) {
      host = (Deno.env.get('VPLAY_MYSQL_HOST') || '').trim();
      user = (Deno.env.get('VPLAY_MYSQL_USER') || '').trim();
      password = Deno.env.get('VPLAY_MYSQL_PASSWORD') || '';
      database = (Deno.env.get('VPLAY_MYSQL_DATABASE') || '').trim();
      port = Number.parseInt((Deno.env.get('VPLAY_MYSQL_PORT') || '3306').trim(), 10);
      if (host && user && password && database) {
        console.log('[VPlay] Usando credenciais MySQL globais (fallback)');
      }
    }

    if (!host || !user || !password || !database) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Credenciais do painel VPlay não configuradas. Preencha host, usuário, senha e banco em Configurações > APIs dos Painéis.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const connection = await mysql.createConnection({
      host, user, password, database,
      port: Number.isFinite(port) ? port : 3306,
      connectTimeout: 10000,
    });

    if (action === 'test') {
      try {
        await connection.query('SELECT 1');
        await connection.end();
        return new Response(JSON.stringify({ success: true, message: 'Conexão com o VPlay validada com sucesso.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (testError) {
        await connection.end().catch(() => undefined);
        throw testError;
      }
    }


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

      // Build username variants (phone number variations)
      const usernameVariants = new Set<string>([normalizedUsername]);
      const digits = normalizedUsername.replace(/\D/g, '');
      if (digits) {
        usernameVariants.add(digits);
        if (digits.startsWith('55') && digits.length >= 12) {
          const withoutCountry = digits.slice(2);
          usernameVariants.add(withoutCountry);
          if (withoutCountry.length === 11 && withoutCountry[2] === '9') {
            usernameVariants.add(withoutCountry.slice(0, 2) + withoutCountry.slice(3));
          } else if (withoutCountry.length === 10) {
            usernameVariants.add(withoutCountry.slice(0, 2) + '9' + withoutCountry.slice(2));
          }
        } else if (digits.length >= 10 && !digits.startsWith('55')) {
          usernameVariants.add('55' + digits);
        }
      }
      const allUsernames = [...usernameVariants].filter(Boolean);
      console.log(`[VPlay] Variantes de username: ${allUsernames.join(', ')}`);

      // Priority tables first, then discover all tables
      const priorityTables = ['lines', 'users', 'user', 'reg_users', 'line', 'accounts', 'subscribers', 'clients', 'members', 'streams'];
      let allDbTables: string[] = [];
      try {
        const [tablesResult] = await connection.query('SHOW TABLES');
        allDbTables = (tablesResult as any[]).map((row) => Object.values(row)[0] as string);
        console.log(`[VPlay] Tabelas no banco: ${allDbTables.join(', ')}`);
      } catch { /* ignore */ }

      // Merge: priority first, then remaining
      const targetTables = [...priorityTables];
      for (const t of allDbTables) {
        if (!targetTables.includes(t)) targetTables.push(t);
      }

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

          // Skip tables without any expiry-like column (not user tables)
          const hasExpiry = ['exp_date', 'expiration', 'expiration_date', 'expire_date', 'expiry_date', 'expires_at', 'expire_at']
            .some((c) => tableColumns.has(c));
          const hasIdentifier = ['username', 'user_name', 'login', 'user', 'email', 'name', 'id']
            .some((c) => tableColumns.has(c));
          if (!hasExpiry || !hasIdentifier) continue;

          const identifierColumns = ['username', 'user_name', 'login', 'user', 'email', 'name']
            .filter((c) => tableColumns.has(c));

          for (const usernameCandidate of allUsernames) {
            const whereClauses: string[] = [];
            const queryParams: Array<string | number> = [];

            for (const column of identifierColumns) {
              whereClauses.push(`TRIM(CAST(\`${column}\` AS CHAR)) = TRIM(?)`);
              queryParams.push(usernameCandidate);
            }

            if (/^\d+$/.test(usernameCandidate) && tableColumns.has('id')) {
              whereClauses.push('`id` = ?');
              queryParams.push(Number(usernameCandidate));
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
              console.log(`[VPlay] Usuário encontrado em ${tableName}, id=${foundUser.id}, username_variant=${usernameCandidate}`);
              break;
            }
          }
          if (foundUser) break;
        } catch {
          // table doesn't exist or error, continue
        }
      }

      if (!foundUser) {
        await connection.end();
        return new Response(
          JSON.stringify({
            success: false,
            error: `Usuário "${normalizedUsername}" não encontrado no servidor VPlay`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // ─── CREDIT DEDUCTION ───
      if (customer_id) {
        let creditsToDeduct = 1;

        if (supabaseAdmin) {
          const { data: customerData } = await supabaseAdmin
            .from('customers')
            .select('id, created_by, plan_id, screens')
            .eq('id', customer_id)
            .maybeSingle();

          let monthsCharged = 1;
          if (customerData?.plan_id) {
            const { data: planData } = await supabaseAdmin
              .from('plans')
              .select('duration_days')
              .eq('id', customerData.plan_id)
              .maybeSingle();

            if (planData?.duration_days) {
              monthsCharged = Math.max(1, Math.round(planData.duration_days / 30));
            }
          }
          // Telas adicionais: cada tela extra custa 0,5 crédito por mês renovado
          const extraScreens = Math.max(0, (Number(customerData?.screens) || 1) - 1);
          creditsToDeduct = monthsCharged + extraScreens * 0.5 * monthsCharged;


          // Try deducting from backend (reseller_access)
          if (customerData?.created_by) {
            const { data: ownerAccess } = await supabaseAdmin
              .from('reseller_access')
              .select('id, credits')
              .eq('user_id', customerData.created_by)
              .maybeSingle();

            if (ownerAccess) {
              if ((ownerAccess.credits ?? 0) < creditsToDeduct) {
                // Check if admin - admins don't need credits
                const { data: adminRole } = await supabaseAdmin
                  .from('user_roles')
                  .select('role')
                  .eq('user_id', customerData.created_by)
                  .eq('role', 'admin')
                  .maybeSingle();

                if (!adminRole) {
                  throw new Error(`Créditos insuficientes. Necessário: ${creditsToDeduct}, disponível: ${ownerAccess.credits ?? 0}`);
                } else {
                  console.log(`[VPlay] Admin detectado - prosseguindo sem desconto de créditos backend`);
                }
              } else {
                const newCredits = ownerAccess.credits - creditsToDeduct;
                const { error: deductError } = await supabaseAdmin
                  .from('reseller_access')
                  .update({ credits: newCredits })
                  .eq('id', ownerAccess.id);

                if (deductError) throw new Error(`Erro ao descontar crédito: ${deductError.message}`);

                chargedAccessId = ownerAccess.id;
                chargedCreditsAmount = creditsToDeduct;
                chargedSource = 'backend';
                console.log(`[VPlay] ${creditsToDeduct} crédito(s) descontado(s) no backend. Saldo: ${newCredits}`);
              }
            }
          }
        }

        // Fallback: deduct from XUI MySQL (table users, column credits)
        if (!chargedAccessId && chargedSource !== 'backend') {
          // Priority 1: Use reseller's panel username from settings
          // Priority 2: Use owner column from found user record
          const vplay_panel_username = (await lookupClient
            ?.from('reseller_api_settings')
            .select('vplay_panel_username')
            .eq('user_id', ownerId)
            .maybeSingle())?.data?.vplay_panel_username;

          let ownerQueryWhere = '';
          let ownerQueryParam: any = null;

          if (vplay_panel_username) {
            ownerQueryWhere = '`username` = ?';
            ownerQueryParam = vplay_panel_username;
            console.log(`[VPlay] Tentando descontar créditos do usuário do painel: ${vplay_panel_username}`);
          } else {
            const ownerIdColumn = ['member_id', 'admin_id', 'user_id', 'owner_id', 'reseller_id']
              .find((c) => foundColumns.has(c) && foundUser[c] !== undefined && foundUser[c] !== null && foundUser[c] !== 0);
            
            if (ownerIdColumn) {
              ownerQueryWhere = '`id` = ?';
              ownerQueryParam = foundUser[ownerIdColumn];
              console.log(`[VPlay] Tentando descontar créditos do ID do dono: ${ownerQueryParam}`);
            }
          }

          if (ownerQueryParam) {
            const ownerTable = 'users';
            try {
              const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${ownerTable}\``);
              const cols = new Set((columnsResult as any[]).map((c) => String(c.Field)));
              const balanceCol = ['credits', 'credit', 'balance', 'wallet', 'money', 'saldo'].find((c) => cols.has(c));

              if (balanceCol) {
                const [ownerRows] = await connection.execute(
                  `SELECT * FROM \`${ownerTable}\` WHERE ${ownerQueryWhere} LIMIT 1`,
                  [ownerQueryParam],
                );
                const owners = ownerRows as any[];
                if (owners.length > 0) {
                  const ownerRow = owners[0];
                  const currentCredits = Number(ownerRow[balanceCol]);
                  if (Number.isFinite(currentCredits)) {
                    if (currentCredits < creditsToDeduct) {
                      const ownerName = ownerRow.username || ownerRow.name || ownerRow.id;
                      throw new Error(`Créditos insuficientes no VPlay para ${ownerName}. Necessário: ${creditsToDeduct}, disponível: ${currentCredits}`);
                    }
                    const newCredits = currentCredits - creditsToDeduct;
                    await connection.execute(
                      `UPDATE \`${ownerTable}\` SET \`${balanceCol}\` = ? WHERE \`id\` = ? LIMIT 1`,
                      [newCredits, ownerRow.id],
                    );
                    chargedCreditsAmount = creditsToDeduct;
                    chargedSource = 'xui';
                    externalRefund = { tableName: ownerTable, balanceColumn: balanceCol, whereColumn: 'id', whereValue: ownerRow.id };
                    console.log(`[VPlay] ${creditsToDeduct} crédito(s) descontado(s) no MySQL (${ownerTable}.${balanceCol}). Saldo: ${newCredits}`);
                  }
                }
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes('Créditos insuficientes')) throw e;
              console.warn(`[VPlay] Fallback MySQL falhou:`, e);
            }
          } else {
            console.warn(`[VPlay] Sem coluna de owner ou usuário de painel encontrada. Renovação prossegue sem desconto.`);
          }
        }

      }

      // ─── RENEWAL (update expiry in MySQL) ───
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
      console.log(`[VPlay] Renovado: ${normalizedUsername}, tabela=${foundTable}, ${expiryColumn}: ${oldExpiration} → ${expDateValue}`);
      await connection.end();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Usuário ${normalizedUsername} renovado no VPlay até ${new_due_date}`,
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
      // Refund backend credits
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
          console.error('[VPlay] Erro reembolso backend:', refundError);
        }
      }

      // Refund XUI MySQL credits
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
          console.error('[VPlay] Erro reembolso MySQL:', refundError);
        }
      }

      try { await connection.end(); } catch { /* ignore */ }
      throw dbError;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[VPlay] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar no VPlay: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
