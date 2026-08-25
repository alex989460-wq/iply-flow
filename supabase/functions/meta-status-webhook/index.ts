import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Webhook da Meta (WhatsApp Cloud API) para status de mensagens:
// entregue (delivered), lido (read) e resposta do cliente (inbound message).
// Atualiza broadcast_logs e recalcula os contadores da campanha.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function normalizePhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

function phoneAliases(phone: string): string[] {
  const digits = normalizePhone(phone);
  const out = new Set<string>([digits]);
  if (digits.startsWith('55')) out.add(digits.slice(2));
  else out.add(`55${digits}`);
  const br = digits.startsWith('55') ? digits.slice(2) : digits;
  if (br.length === 11 && br[2] === '9') out.add(`55${br.slice(0, 2)}${br.slice(3)}`);
  if (br.length === 10) out.add(`55${br.slice(0, 2)}9${br.slice(2)}`);
  return Array.from(out).filter(Boolean);
}

async function recountCampaign(campaignId: string) {
  const { data: logs } = await supabase
    .from('broadcast_logs')
    .select('last_status, delivered_at, read_at, replied_at')
    .eq('campaign_id', campaignId);
  const rows = logs || [];
  await supabase
    .from('broadcast_campaigns')
    .update({
      delivered_count: rows.filter((r: any) => !!r.delivered_at).length,
      read_count: rows.filter((r: any) => !!r.read_at).length,
      replied_count: rows.filter((r: any) => !!r.replied_at).length,
    })
    .eq('id', campaignId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);

  // Verificação do webhook (GET) exigida pela Meta
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    const expected = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') || '';
    if (mode === 'subscribe' && (!expected || token === expected)) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  try {
    const payload = await req.json();
    const touchedCampaigns = new Set<string>();

    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value || {};

        // 1) Status: delivered / read
        for (const status of value?.statuses || []) {
          const messageId = status?.id;
          const state = String(status?.status || '').toLowerCase();
          if (!messageId) continue;

          const patch: Record<string, string> = {};
          const ts = status?.timestamp
            ? new Date(Number(status.timestamp) * 1000).toISOString()
            : new Date().toISOString();
          if (state === 'delivered') patch.delivered_at = ts;
          if (state === 'read') {
            patch.read_at = ts;
            patch.delivered_at = ts;
          }
          if (!Object.keys(patch).length) continue;

          const { data: rows } = await supabase
            .from('broadcast_logs')
            .update(patch)
            .eq('wa_message_id', messageId)
            .select('campaign_id');
          for (const r of rows || []) if (r?.campaign_id) touchedCampaigns.add(r.campaign_id);
        }

        // 2) Mensagens recebidas = resposta do cliente
        for (const message of value?.messages || []) {
          const from = normalizePhone(message?.from || '');
          if (!from) continue;
          const aliases = phoneAliases(from);
          const ts = message?.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          const { data: rows } = await supabase
            .from('broadcast_logs')
            .update({ replied_at: ts })
            .in('phone_normalized', aliases)
            .is('replied_at', null)
            .select('campaign_id');
          for (const r of rows || []) if (r?.campaign_id) touchedCampaigns.add(r.campaign_id);
        }
      }
    }

    for (const campaignId of touchedCampaigns) await recountCampaign(campaignId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('meta-status-webhook error', e);
    // A Meta reenvia em caso de erro; responde 200 para evitar loops.
    return new Response(JSON.stringify({ success: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
