import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const CUSTOMER_COLUMNS =
  'id, name, phone, username, server_id, plan_id, due_date, status, screens, custom_price, notes, extra_months, created_by, start_date, created_at';

async function fetchAllCustomers(admin: any, ownerId: string | null) {
  const rows: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let q = admin.from('customers').select(CUSTOMER_COLUMNS).range(from, from + pageSize - 1);
    if (ownerId) q = q.eq('created_by', ownerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function sendToTelegram(fileName: string, content: string, caption: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const rawChatId = (Deno.env.get('TELEGRAM_CHAT_ID') || '').trim();
  if (!token || !rawChatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados' };
  }

  // Suporta "chatId:threadId" para tópicos de grupo (ex.: -1001234567890:12)
  let baseId = rawChatId;
  let threadId: string | null = null;
  const parts = rawChatId.split(':');
  if (parts.length === 2 && /^-?\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    baseId = parts[0];
    threadId = parts[1];
  }

  // Variações: como informado, com "-" (grupo antigo) e com "-100" (supergrupo/canal)
  const candidates: string[] = [baseId];
  if (/^\d+$/.test(baseId)) {
    candidates.push(`-${baseId}`, `-100${baseId}`);
  } else if (/^-\d+$/.test(baseId) && !baseId.startsWith('-100')) {
    candidates.push(`-100${baseId.slice(1)}`);
  }

  let lastError = '';
  const sanitize = (msg: string) => msg.replaceAll(token, '***');

  for (const chatId of candidates) {
    let chatNotFound = false;

    // Retry para falhas de rede transitórias (connection reset)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', caption);
      if (threadId) form.append('message_thread_id', threadId);
      form.append('document', new Blob([content], { type: 'application/json' }), fileName);

      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
          method: 'POST',
          body: form,
        });
        const body = await res.text();

        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch { /* ignore */ }

        if (res.ok && parsed?.ok !== false) {
          if (chatId !== rawChatId) console.log(`[Backup] Telegram enviado usando chat_id ajustado: ${chatId}`);
          return { ok: true };
        }

        lastError = sanitize(`Telegram ${res.status}: ${parsed?.description || body}`);
        chatNotFound = String(parsed?.description || '').toLowerCase().includes('chat not found');
        console.error(`[Backup] Falha com chat_id ${chatId} -> ${lastError}`);
        break; // resposta da API: não adianta repetir a mesma tentativa
      } catch (e) {
        lastError = sanitize(`Falha de rede: ${e instanceof Error ? e.message : String(e)}`);
        console.error(`[Backup] Tentativa ${attempt} falhou -> ${lastError}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    // Só vale tentar outra variação quando o chat não foi encontrado
    if (!chatNotFound) break;
  }

  return { ok: false, error: lastError };
}



serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // ---- AuthN/AuthZ ----
    const cronSecret = Deno.env.get('BACKUP_CRON_SECRET');
    const providedCron = req.headers.get('x-cron-secret');
    const isCron = !!cronSecret && !!providedCron && providedCron === cronSecret;

    let userId: string | null = null;
    let isAdmin = false;

    if (!isCron) {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace('Bearer ', '');
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: jsonHeaders });
      }
      const { data: adminCheck } = await supabaseAdmin.rpc('has_role', { _user_id: userId, _role: 'admin' });
      isAdmin = adminCheck === true;
    }

    // ---- DIAGNÓSTICO TELEGRAM (cron/admin) ----
    if (body?.action === 'telegram_diag') {
      if (!isCron && !isAdmin) {
        return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: jsonHeaders });
      }
      const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
      const configured = (Deno.env.get('TELEGRAM_CHAT_ID') || '').trim();
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const me = await meRes.json();
      const upRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
      const up = await upRes.json();
      const chats = (up?.result || []).map((u: any) => {
        const m = u.message || u.channel_post || u.my_chat_member || u.edited_message;
        return m?.chat ? { id: m.chat.id, type: m.chat.type, title: m.chat.title || m.chat.username } : null;
      }).filter(Boolean);
      return new Response(JSON.stringify({
        bot: me?.result?.username || null,
        configured_chat_id: configured,
        chats_visiveis: chats,
        updates_ok: up?.ok,
      }), { headers: jsonHeaders });
    }


    // ---- RESTORE (admin only) ----
    if (body?.action === 'restore' && body?.backup_id) {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Apenas administradores podem restaurar' }), { status: 403, headers: jsonHeaders });
      }

      const { data: backup, error: bErr } = await supabaseAdmin
        .from('customer_backups')
        .select('backup_data, total_customers')
        .eq('id', body.backup_id)
        .single();

      if (bErr || !backup) {
        return new Response(JSON.stringify({ error: 'Backup não encontrado' }), { status: 404, headers: jsonHeaders });
      }

      const customers = (backup.backup_data as any[]) || [];
      if (!Array.isArray(customers) || customers.length === 0) {
        return new Response(JSON.stringify({ error: 'Backup sem dados (backups enviados ao Telegram não podem ser restaurados por aqui)' }), { status: 400, headers: jsonHeaders });
      }

      // Safety snapshot before wiping
      const allCustomers = await fetchAllCustomers(supabaseAdmin, null);
      await supabaseAdmin.from('customer_backups').insert({
        backup_data: allCustomers,
        total_customers: allCustomers.length,
        backup_type: 'pre_restore',
      });

      const idsToDelete = allCustomers.map((c: any) => c.id);
      for (let i = 0; i < idsToDelete.length; i += 500) {
        await supabaseAdmin.from('customers').delete().in('id', idsToDelete.slice(i, i + 500));
      }

      let inserted = 0;
      for (let i = 0; i < customers.length; i += 100) {
        const batch = customers.slice(i, i + 100).map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          username: c.username || null,
          server_id: c.server_id || null,
          plan_id: c.plan_id || null,
          due_date: c.due_date,
          status: c.status || 'ativa',
          screens: c.screens || 1,
          custom_price: c.custom_price || null,
          notes: c.notes || null,
          extra_months: c.extra_months || 0,
          created_by: c.created_by || null,
          start_date: c.start_date || c.due_date,
          created_at: c.created_at || new Date().toISOString(),
        }));
        const { error: insErr } = await supabaseAdmin.from('customers').insert(batch);
        if (insErr) console.error(`[Restore] Batch ${i} erro:`, insErr);
        else inserted += batch.length;
      }

      return new Response(JSON.stringify({ success: true, restored: inserted, total: customers.length }), { headers: jsonHeaders });
    }

    // ---- IMPORTAR BACKUP (arquivo JSON, admin only) ----
    if (body?.action === 'import' && Array.isArray(body?.customers)) {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Apenas administradores podem importar' }), { status: 403, headers: jsonHeaders });
      }

      const incoming = body.customers as any[];
      if (incoming.length === 0) {
        return new Response(JSON.stringify({ error: 'Arquivo sem clientes' }), { status: 400, headers: jsonHeaders });
      }

      const mode = body?.mode === 'replace' ? 'replace' : 'merge';

      // Snapshot de segurança antes de qualquer alteração
      const before = await fetchAllCustomers(supabaseAdmin, null);
      await supabaseAdmin.from('customer_backups').insert({
        backup_data: before,
        total_customers: before.length,
        backup_type: 'pre_import',
      });

      if (mode === 'replace') {
        const ids = before.map((c: any) => c.id);
        for (let i = 0; i < ids.length; i += 500) {
          await supabaseAdmin.from('customers').delete().in('id', ids.slice(i, i + 500));
        }
      }

      let saved = 0;
      const errors: string[] = [];
      for (let i = 0; i < incoming.length; i += 100) {
        const batch = incoming.slice(i, i + 100).map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          username: c.username || null,
          server_id: c.server_id || null,
          plan_id: c.plan_id || null,
          due_date: c.due_date,
          status: c.status || 'ativa',
          screens: c.screens || 1,
          custom_price: c.custom_price ?? null,
          notes: c.notes || null,
          extra_months: c.extra_months || 0,
          created_by: c.created_by || null,
          start_date: c.start_date || c.due_date,
          created_at: c.created_at || new Date().toISOString(),
        })).filter((c: any) => c.id && c.name && c.due_date);

        const { error: upErr } = await supabaseAdmin.from('customers').upsert(batch, { onConflict: 'id' });
        if (upErr) errors.push(upErr.message);
        else saved += batch.length;
      }

      return new Response(JSON.stringify({ success: true, imported: saved, total: incoming.length, mode, errors: errors.slice(0, 3) }), { headers: jsonHeaders });
    }

    // ---- BACKUP ----
    // Cron => respeita o intervalo configurado e envia a base completa ao Telegram.
    // Usuário logado => somente os próprios clientes (admin pode pedir tudo).
    let settingsId: string | null = null;
    if (isCron) {
      const { data: cfg } = await supabaseAdmin
        .from('backup_settings')
        .select('id, enabled, interval_hours, interval_minutes, last_run_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cfg) {
        settingsId = cfg.id;
        if (!cfg.enabled) {
          return new Response(JSON.stringify({ skipped: true, reason: 'disabled' }), { headers: jsonHeaders });
        }
        const minutes = Number((cfg as any).interval_minutes) > 0
          ? Number((cfg as any).interval_minutes)
          : Math.max(1, cfg.interval_hours || 3) * 60;
        const intervalMs = Math.max(1, minutes) * 60_000;
        const tolerance = minutes <= 5 ? 5_000 : 60_000;
        if (cfg.last_run_at && Date.now() - new Date(cfg.last_run_at).getTime() < intervalMs - tolerance) {
          return new Response(JSON.stringify({ skipped: true, reason: 'interval_not_reached' }), { headers: jsonHeaders });
        }
      }
    }

    const ownerFilter = isCron ? null : (isAdmin && body?.scope === 'all' ? null : userId);
    const customers = await fetchAllCustomers(supabaseAdmin, ownerFilter);


    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup-clientes-${stamp}.json`;
    const payload = JSON.stringify(
      { generated_at: new Date().toISOString(), total: customers.length, customers },
      null,
      2,
    );

    const tg = await sendToTelegram(
      fileName,
      payload,
      `🔐 Backup automático\n📅 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n👥 ${customers.length} clientes`,
    );

    // Log leve (sem payload) para não pesar o banco
    await supabaseAdmin.from('customer_backups').insert({
      backup_data: [],
      total_customers: customers.length,
      backup_type: tg.ok ? 'telegram' : 'telegram_failed',
    });

    if (!tg.ok) {
      return new Response(JSON.stringify({ error: tg.error, total_customers: customers.length }), { status: 502, headers: jsonHeaders });
    }

    if (settingsId) {
      await supabaseAdmin.from('backup_settings')
        .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', settingsId);
    }



    console.log(`[Backup] ${customers.length} clientes enviados ao Telegram`);
    return new Response(JSON.stringify({
      success: true,
      total_customers: customers.length,
      file: fileName,
      timestamp: new Date().toISOString(),
    }), { headers: jsonHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[Backup] Erro:', error);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
