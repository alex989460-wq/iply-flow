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
  if (!n.startsWith('55') && n.length <= 11) n = '55' + n;
  return n;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { hour, minute } = getCurrentTimeSaoPaulo();
    const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const { data: schedules } = await supabase
      .from('evolution_billing_schedule')
      .select('*')
      .eq('is_enabled', true);

    const toRun = (schedules || []).filter((s: any) => s.send_time.substring(0, 5) === currentTime);
    if (toRun.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const sched of toRun) {
      const today = getRelativeDateSaoPaulo(0);
      const yesterday = getRelativeDateSaoPaulo(-1);
      const tomorrow = getRelativeDateSaoPaulo(1);

      const types: string[] = [];
      if (sched.send_d_minus_1) types.push('D-1');
      if (sched.send_d0) types.push('D0');
      if (sched.send_d_plus_1) types.push('D+1');

      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, extra_phone, due_date, status, plan_id')
        .in('status', ['ativa', 'inativa'])
        .eq('created_by', sched.user_id)
        .in('due_date', [yesterday, today, tomorrow]);

      const list: any[] = [];
      for (const c of customers || []) {
        let bt: string | null = null;
        if (c.due_date === tomorrow) bt = 'D-1';
        else if (c.due_date === today) bt = 'D0';
        else if (c.due_date === yesterday) bt = 'D+1';
        if (!bt || !types.includes(bt)) continue;
        list.push({ ...c, billingType: bt });
      }

      const minDelay = Math.max(5, sched.min_delay_seconds || 15) * 1000;
      const maxDelay = Math.max(minDelay / 1000, sched.max_delay_seconds || 30) * 1000;

      const tplMap: Record<string, string> = {
        'D-1': sched.message_d_minus_1 || 'Olá {{nome}}, vence amanhã ({{vencimento}}).',
        'D0': sched.message_d0 || 'Olá {{nome}}, vence hoje ({{vencimento}}).',
        'D+1': sched.message_d_plus_1 || 'Olá {{nome}}, venceu ontem ({{vencimento}}).',
      };

      let sent = 0, errors = 0;

      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const tpl = tplMap[c.billingType as string];
        const vencDate = new Date(c.due_date + 'T00:00:00');
        const vars = {
          nome: c.name || '',
          vencimento: vencDate.toLocaleDateString('pt-BR'),
          telefone: c.phone || '',
        };
        const text = renderTemplate(tpl, vars);

        try {
          const { data, error } = await supabase.functions.invoke('evolution-send', {
            body: {
              action: 'send',
              phone: normalizePhone(c.phone),
              text,
              userId: sched.user_id,
            },
          });
          if (error || data?.error) {
            errors++;
            console.error(`[evo-billing] send failed for ${c.name}:`, error || data?.error);
          } else {
            sent++;
          }
        } catch (e) {
          errors++;
          console.error(`[evo-billing] exception for ${c.name}:`, e);
        }

        await supabase.from('billing_logs').insert({
          customer_id: c.id,
          billing_type: c.billingType,
          message: `[Evolution] [${normalizePhone(c.phone)}] ${text.substring(0, 100)}`,
          whatsapp_status: errors > sent ? 'error' : 'sent',
        });

        if (i < list.length - 1) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          console.log(`[evo-billing] waiting ${(delay / 1000).toFixed(1)}s`);
          await new Promise(r => setTimeout(r, delay));
        }
      }

      await supabase
        .from('evolution_billing_schedule')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: `success: ${sent} enviadas, ${errors} erros`,
        })
        .eq('id', sched.id);

      results.push({ user_id: sched.user_id, sent, errors });
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
