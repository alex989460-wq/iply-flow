// Keep WhatsApp 24h window alive for the notification_phone of each user.
// Sends an approved template if no message was sent to that phone in the last ~23h.
// Designed to be invoked hourly by pg_cron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(p: string): string {
  let n = (p || '').replace(/\D/g, '');
  if (!n) return '';
  if (!n.startsWith('55') && n.length <= 11) n = '55' + n;
  return n;
}

// Window threshold — re-send if last activity is older than this (in ms).
// 23h leaves a 1h safety buffer before Meta's 24h session expires.
const REFRESH_AFTER_MS = 23 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch users who have both a server and a user (active integration)
    const { data: settingsList, error: setErr } = await supabase
      .from('billing_settings')
      .select('user_id, notification_phone, meta_template_name, user:users(id), server:servers(id)')
      .not('user', 'is', null)
      .not('server', 'is', null);

    if (setErr) {
      console.error('[KeepAlive] Error fetching billing_settings:', setErr);
      return new Response(JSON.stringify({ error: 'fetch_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cutoffIso = new Date(Date.now() - REFRESH_AFTER_MS).toISOString();
    const results: any[] = [];

    for (const s of settingsList || []) {
      const userId = s.user_id;
      const rawPhone = s.notification_phone;
      if (!userId || !rawPhone) continue;

      const phone = normalizePhone(rawPhone);
      if (!phone) continue;

      // Check zap settings (need department_id to send)
      const { data: zap } = await supabase
        .from('zap_responder_settings')
        .select('selected_department_id')
        .eq('user_id', userId)
        .maybeSingle();

      const departmentId = zap?.selected_department_id;
      if (!departmentId) {
        console.log(`[KeepAlive] User ${userId}: sem selected_department_id — pulando.`);
        continue;
      }

      // Check the most recent message_logs entry for this phone+user
      const { data: lastLog } = await supabase
        .from('message_logs')
        .select('created_at')
        .eq('user_id', userId)
        .eq('customer_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastLog?.created_at && lastLog.created_at > cutoffIso) {
        // Window is still fresh, no need to refresh
        results.push({ user_id: userId, phone, status: 'fresh', last: lastLog.created_at });
        continue;
      }

      const tplName = s.meta_template_name || 'pedido_aprovado';

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/zap-responder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            action: 'enviar-template',
            department_id: departmentId,
            template_name: tplName,
            number: phone,
            language: 'pt_BR',
            user_id: userId,
          }),
        });

        const ok = resp.ok;
        const body = await resp.json().catch(() => ({}));
        const success = ok && body?.success !== false;

        await supabase.from('message_logs').insert({
          user_id: userId,
          customer_phone: phone,
          message_type: 'keep_alive',
          source: 'keep-window-alive',
          status: success ? 'sent' : 'error',
          error_message: success ? null : (body?.error || `http_${resp.status}`),
          metadata: { template_name: tplName },
        });

        results.push({ user_id: userId, phone, status: success ? 'refreshed' : 'failed', template: tplName });
        console.log(`[KeepAlive] ${userId} → ${phone}: ${success ? 'OK' : 'FAIL'} (template=${tplName})`);
      } catch (e: any) {
        console.error(`[KeepAlive] Error sending to ${phone}:`, e?.message || e);
        results.push({ user_id: userId, phone, status: 'exception', error: String(e?.message || e) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[KeepAlive] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'unexpected' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
