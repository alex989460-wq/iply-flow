import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getRelativeDateSaoPaulo(daysOffset: number): string {
  const now = new Date();
  const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [y, m, d] = saoPauloDate.split('-').map(Number);
  const target = new Date(y, m - 1, d + daysOffset);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

function getCurrentTimeSaoPaulo(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  return {
    hour: parseInt(parts.find(p => p.type === 'hour')?.value ?? '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value ?? '0'),
  };
}

function normalizePhone(phone: string): string {
  let n = String(phone || '').replace(/\D/g, '');
  const foreignDdis = ['971','598','595','593','591','353','351','86','81','61','58','57','56','54','52','51','49','44','41','39','34','33','32','31'];
  const hasForeignDdi = foreignDdis.some((ddi) => n.startsWith(ddi) && n.length > ddi.length);
  if (!n.startsWith('55') && !hasForeignDdi && n.length >= 10 && n.length <= 11) n = '55' + n;
  return n;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function evoHeaders(apiKey: string, json = false, instanceId = '') {
  const h: Record<string, string> = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  if (json) h['Content-Type'] = 'application/json';
  if (instanceId) h.instanceId = instanceId;
  return h;
}

async function fetchJson(url: string, init: RequestInit = {}, ms = 15000) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: String((e as Error).message || e) } };
  }
}

async function resolveInstanceAuth(baseUrl: string, apiKey: string, instance: string) {
  const r = await fetchJson(`${baseUrl}/instance/all`, { headers: evoHeaders(apiKey) }, 8000);
  const rows = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
  const wanted = instance.toLowerCase();
  const found = rows.find((it: any) =>
    String(it?.id || '').toLowerCase() === wanted ||
    String(it?.name || it?.instanceName || '').toLowerCase() === wanted
  ) || rows.find((it: any) => String(it?.token || it?.hash || '') === apiKey);
  return {
    apiKey: found?.token || found?.hash || apiKey,
    instanceId: found?.id || found?.instanceId || instance,
  };
}

async function sendEvoText(baseUrl: string, apiKey: string, instance: string, instAuth: any, phone: string, text: string) {
  const attempts = [
    { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evoHeaders(apiKey, true), body: { number: phone, text } },
    { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evoHeaders(apiKey, true), body: { number: phone, textMessage: { text } } },
    { url: `${baseUrl}/send/text`, headers: evoHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, text } },
    { url: `${baseUrl}/message/sendText`, headers: evoHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, text } },
  ];
  for (const a of attempts) {
    const r = await fetchJson(a.url, { method: 'POST', headers: a.headers, body: JSON.stringify(a.body) }, 20000);
    if (r.ok) return { ok: true, data: r.data };
    if (r.status !== 404 && r.status !== 405 && r.status !== 400 && r.status !== 0) return { ok: false, status: r.status, data: r.data };
  }
  return { ok: false, status: 0, data: { error: 'all endpoints failed' } };
}

async function sendEvoImage(baseUrl: string, apiKey: string, instance: string, instAuth: any, phone: string, imageUrl: string, caption: string) {
  const body = { number: phone, mediatype: 'image', mimetype: 'image/jpeg', fileName: 'image.jpg', caption, media: imageUrl };
  const goBody = { number: phone, type: 'image', url: imageUrl, filename: 'image.jpg', caption };
  const attempts = [
    { url: `${baseUrl}/send/media`, headers: evoHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody },
    { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evoHeaders(apiKey, true), body },
    { url: `${baseUrl}/message/sendMedia`, headers: evoHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody },
  ];
  for (const a of attempts) {
    const r = await fetchJson(a.url, { method: 'POST', headers: a.headers, body: JSON.stringify(a.body) }, 30000);
    if (r.ok) return { ok: true, data: r.data };
    if (r.status !== 404 && r.status !== 405 && r.status !== 400 && r.status !== 0) return { ok: false, status: r.status, data: r.data };
  }
  return { ok: false, status: 0, data: { error: 'all media endpoints failed' } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const force = !!body.force;
    const filterUserId: string | undefined = body.userId;

    const { hour, minute } = getCurrentTimeSaoPaulo();
    const currentMinutes = hour * 60 + minute;
    const todayStrSP = getRelativeDateSaoPaulo(0);

    let query = supabase
      .from('evolution_billing_schedule')
      .select('*')
      .eq('is_enabled', true);
    if (filterUserId) query = query.eq('user_id', filterUserId);

    const { data: schedules } = await query;

    // Run if past send_time, within 6h window, and not completed today.
    // Cron resumes the same schedule across ticks until done.
    const toRun = (schedules || []).filter((s: any) => {
      if (force) return true;
      const [sh, sm] = String(s.send_time).substring(0, 5).split(':').map(Number);
      const sendMin = sh * 60 + sm;
      if (currentMinutes < sendMin) return false;
      if (currentMinutes > sendMin + 360) return false;
      const status = typeof s.last_run_status === 'string' ? s.last_run_status : '';
      if (s.last_run_at && status.startsWith('completed:')) {
        const last = new Date(s.last_run_at);
        const lastSP = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(last);
        if (lastSP === todayStrSP) return false;
      }
      // Concurrency lock: skip if another tick is currently running this schedule (<3 min ago)
      if (s.last_run_at && status.startsWith('in_progress')) {
        const ageMs = Date.now() - new Date(s.last_run_at).getTime();
        if (ageMs < 3 * 60 * 1000) return false;
      }
      return true;
    });
    if (toRun.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // O limite real é o deadline de ~110s por execução; o cron continua o restante a cada minuto
    const BATCH_SIZE = force ? 20 : 10;

    const results: any[] = [];

    for (const sched of toRun) {
      const { data: billingSettings } = await supabase
        .from('billing_settings')
        .select('use_evolution_billing')
        .eq('user_id', sched.user_id)
        .maybeSingle();
      if (!billingSettings?.use_evolution_billing) {
        results.push({ user_id: sched.user_id, sent: 0, errors: 0, skipped: 'zap_responder_selected' });
        continue;
      }

      // Evolution credentials for this user
      const { data: evo } = await supabase
        .from('evolution_settings')
        .select('base_url, api_key, instance_name')
        .eq('user_id', sched.user_id)
        .maybeSingle();
      if (!evo?.base_url || !evo?.api_key || !evo?.instance_name) {
        results.push({ user_id: sched.user_id, sent: 0, errors: 0, skipped: 'evolution_not_configured' });
        continue;
      }
      const baseUrl = String(evo.base_url).replace(/\/$/, '');
      const apiKey = String(evo.api_key);
      const instance = String(evo.instance_name);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);

      // ---- Rules: custom message types (evolution_billing_rules) with legacy fallback ----
      const { data: customRules } = await supabase
        .from('evolution_billing_rules')
        .select('*')
        .eq('user_id', sched.user_id)
        .eq('is_enabled', true)
        .order('sort_order', { ascending: true });

      type Rule = {
        days_offset: number;
        message: string;
        image_url: string | null;
        button_enabled: boolean;
        button_label: string | null;
        button_url: string | null;
      };

      let rules: Rule[] = (customRules || []).map((r: any) => ({
        days_offset: Number(r.days_offset) || 0,
        message: r.message || '',
        image_url: r.image_url || null,
        button_enabled: !!r.button_enabled,
        button_label: r.button_label || null,
        button_url: r.button_url || null,
      }));

      if (rules.length === 0) {
        const legacy: Array<[boolean, number, string, string]> = [
          [!!sched.send_d_minus_1, 1, sched.message_d_minus_1 || 'Olá {{nome}}, vence amanhã ({{vencimento}}).', 'D-1'],
          [!!sched.send_d0, 0, sched.message_d0 || 'Olá {{nome}}, vence hoje ({{vencimento}}).', 'D0'],
          [!!sched.send_d_plus_1, -1, sched.message_d_plus_1 || 'Olá {{nome}}, venceu ontem ({{vencimento}}).', 'D+1'],
        ];
        rules = legacy.filter(([on]) => on).map(([, off, msg]) => ({
          days_offset: off,
          message: msg,
          image_url: sched.image_url || null,
          button_enabled: !!sched.renew_button_enabled,
          button_label: sched.renew_button_label || null,
          button_url: sched.renew_button_url || null,
        }));
      }

      if (rules.length === 0) {
        results.push({ user_id: sched.user_id, sent: 0, errors: 0, skipped: 'no_rules' });
        continue;
      }

      // due_date => rule
      const ruleByDate = new Map<string, Rule>();
      for (const r of rules) {
        const d = getRelativeDateSaoPaulo(r.days_offset);
        if (!ruleByDate.has(d)) ruleByDate.set(d, r);
      }
      const targetDates = Array.from(ruleByDate.keys());
      const today = getRelativeDateSaoPaulo(0);

      const billingTypeFor = (offset: number) => (offset > 0 ? 'D-1' : offset === 0 ? 'D0' : 'D+1');

      const { data: customers } = await supabase
        .from('customers')
        .select(`
          id, name, phone, extra_phone, due_date, status, screens, custom_price,
          plan:plans(id, plan_name, price, duration_days),
          server:servers(id, server_name),
          username
        `)
        .in('status', ['ativa', 'inativa'])
        .eq('created_by', sched.user_id)
        .in('due_date', targetDates);

      // Pre-fetch today's billing_logs (apenas dos clientes deste usuário) para retomar entre execuções
      const customerIds = (customers || []).map((c: any) => c.id);
      const { data: existingLogs } = customerIds.length
        ? await supabase
            .from('billing_logs')
            .select('customer_id, billing_type')
            .in('customer_id', customerIds)
            .gte('sent_at', `${today}T00:00:00`)
            .lte('sent_at', `${today}T23:59:59`)
        : { data: [] as any[] };
      const alreadyDone = new Set((existingLogs || []).map((l: any) => `${l.customer_id}|${l.billing_type}`));

      const list: any[] = [];
      for (const c of customers || []) {
        const rule = ruleByDate.get(c.due_date as string);
        if (!rule) continue;
        const bt = billingTypeFor(rule.days_offset);
        if (!force && alreadyDone.has(`${c.id}|${bt}`)) continue;
        list.push({ ...c, billingType: bt, rule });
      }

      const totalPending = list.length;
      const batch = list.slice(0, BATCH_SIZE);
      console.log(`[evo-billing] user ${sched.user_id}: ${totalPending} pendentes, processando ${batch.length}`);

      // Mark in_progress immediately so the panel reflects activity and we don't double-trigger
      await supabase
        .from('evolution_billing_schedule')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: `in_progress: ${totalPending} pendentes`,
        })
        .eq('id', sched.id);

      const minDelay = Math.max(5, sched.min_delay_seconds || 8) * 1000;
      const maxDelay = Math.max(minDelay / 1000, sched.max_delay_seconds || 15) * 1000;


      let sent = 0, errors = 0;
      let processed = 0;
      // Edge functions são encerradas após ~150s ociosos: paramos antes disso e o cron continua o restante
      const RUN_DEADLINE_MS = 110_000;
      const runStartedAt = Date.now();

      for (let i = 0; i < batch.length; i++) {
        if (Date.now() - runStartedAt > RUN_DEADLINE_MS) {
          console.log('[evo-billing] deadline atingido, restante continua no próximo ciclo');
          break;
        }
        const c = batch[i];
        const rule: Rule = c.rule;
        const tpl = rule.message || 'Olá {{nome}}, sua assinatura vence em {{vencimento}}.';
        const vencDate = new Date(c.due_date + 'T12:00:00');
        const price = c.custom_price ?? c.plan?.price ?? 0;
        const vars: Record<string, string> = {
          nome: c.name || '',
          vencimento: vencDate.toLocaleDateString('pt-BR'),
          telefone: c.phone || '',
          valor: `R$ ${Number(price).toFixed(2)}`,
          usuario: c.username || '-',
          plano: c.plan?.plan_name || '-',
          status: c.status || '-',
          telas: String(c.screens || 1),
          servidor: c.server?.server_name || '-',
          link: rule.button_url || '',
        };
        // Aliases em inglês/abreviados
        vars.name = vars.nome;
        vars.user = vars.usuario;
        vars.price = Number(price).toFixed(2);
        vars.weak = vars.plano;
        vars.serv = vars.servidor;
        vars.data = vars.vencimento;
        let text = renderTemplate(tpl, vars);

        if (rule.button_enabled && rule.button_url) {
          const label = rule.button_label || 'Renovar agora';
          text += `\n\n👉 *${label}:* ${rule.button_url}`;
        }

        const phone = normalizePhone(c.phone);

        // Atomic reservation: insert the log first; unique index blocks duplicates from parallel ticks
        const { data: reservation, error: reserveError } = await supabase
          .from('billing_logs')
          .insert({
            customer_id: c.id,
            billing_type: c.billingType,
            message: `[Evolution] [${phone}] reservando envio...`,
            whatsapp_status: 'pending',
          })
          .select('id')
          .single();

        if (reserveError && !force) {
          // Duplicate (already sent today by another tick) — skip silently
          console.log(`[evo-billing] skip duplicate ${c.name} ${c.billingType}:`, reserveError.message);
          continue;
        }

        let result: any;
        try {
          if (rule.image_url) {
            result = await sendEvoImage(baseUrl, apiKey, instance, instAuth, phone, rule.image_url, text);
            if (!result.ok) {
              result = await sendEvoText(baseUrl, apiKey, instance, instAuth, phone, text);
            }
          } else {
            result = await sendEvoText(baseUrl, apiKey, instance, instAuth, phone, text);
          }
          if (result?.ok) sent++;
          else { errors++; console.error(`[evo-billing] ${c.name}:`, result); }
        } catch (e) {
          errors++;
          console.error(`[evo-billing] exception for ${c.name}:`, e);
        }

        if (reservation?.id) {
          await supabase.from('billing_logs').update({
            message: `[Evolution] [${phone}] ${text.substring(0, 120)}`,
            whatsapp_status: result?.ok ? 'sent' : 'error',
          }).eq('id', reservation.id);
        }

        processed++;

        if (i < batch.length - 1 && Date.now() - runStartedAt < RUN_DEADLINE_MS) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          await new Promise(r => setTimeout(r, delay));
        }
      }

      const remaining = totalPending - processed;
      const status = remaining > 0
        ? `in_progress: lote ${sent} enviadas / ${remaining} restantes`
        : `completed: ${sent} enviadas, ${errors} erros nesta execução`;

      await supabase
        .from('evolution_billing_schedule')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: status,
        })
        .eq('id', sched.id);

      results.push({ user_id: sched.user_id, sent, errors, total: batch.length, remaining });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[evo-billing] error:', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
