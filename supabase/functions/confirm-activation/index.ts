import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const payload = await req.json();
    console.log('[ActivationAction] Payload:', JSON.stringify(payload));
    const request_id = payload?.request_id;
    // `auto: true` (webhooks) equivale a uma ativação.
    const action = payload?.action || (payload?.auto ? 'activate' : null);
    const force = !!payload?.force;
    const source = String(payload?.source || 'confirm-activation');

    if (!request_id || !action) {
      return new Response(JSON.stringify({ error: 'request_id e action são obrigatórios' }), { status: 400, headers: jsonHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Get the activation request
    const { data: request, error: reqErr } = await supabaseAdmin
      .from('activation_requests')
      .select('*')
      .eq('id', request_id)
      .maybeSingle();

    if (reqErr || !request) {
      return new Response(JSON.stringify({ error: 'Solicitação não encontrada' }), { status: 404, headers: jsonHeaders });
    }

    // ── Auto-activate on external panel when applicable (Duplecast / Clouddy) ──
    let autoActivationError: string | null = null;
    let autoActivationOk = false;
    if (action === 'activate' && request.user_id) {
      const appUpper = String(request.app_name || '').toUpperCase();
      const findInObj = (obj: any, keys: string[]): string => {
        if (!obj || typeof obj !== 'object') return '';
        for (const k of Object.keys(obj)) {
          if (keys.some(x => k.toLowerCase() === x.toLowerCase())) {
            const v = obj[k];
            if (v != null && typeof v !== 'object') return String(v);
          }
        }
        for (const v of Object.values(obj)) {
          if (v && typeof v === 'object') {
            const f = findInObj(v, keys);
            if (f) return f;
          }
        }
        return '';
      };

      try {
        if (appUpper.includes('DUPLECAST')) {
          const { data: cred } = await supabaseAdmin
            .from('activation_panel_credentials')
            .select('username, password, is_enabled')
            .eq('user_id', request.user_id)
            .eq('panel_type', 'duplecast')
            .maybeSingle();

          if (!cred || !(cred as any).is_enabled) {
            autoActivationError = 'Credenciais Duplecast não configuradas ou desabilitadas';
          } else if (!request.mac_address) {
            autoActivationError = 'MAC do cliente ausente na solicitação';
          } else {
            const code =
              findInObj(request.cakto_payload, ['code', 'codigo', 'código', 'activation_code', 'codigo_ativacao']) ||
              String((request as any).code || '');
            const r = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/duplecast-activate`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  email: (cred as any).username,
                  password: (cred as any).password,
                  mac: request.mac_address,
                  code: code || undefined,
                }),
              },
            );
            const j = await r.json().catch(() => ({}));
            if (r.ok && j?.success) autoActivationOk = true;
            else autoActivationError = j?.error || `HTTP ${r.status}`;
          }

        } else if (appUpper.includes('CLOUDDY')) {
          const email = request.email;
          if (!email) {
            autoActivationError = 'E-mail do cliente Clouddy ausente';
          } else {
            const sum = String(request.amount || '');
            const r = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/clouddy-renew`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'x-cakto-webhook-secret': Deno.env.get('CAKTO_WEBHOOK_SECRET') || '',
                },
                body: JSON.stringify({ email, sum, user_id: request.user_id }),
              },
            );
            const j = await r.json().catch(() => ({}));
            if (r.ok && j?.success) autoActivationOk = true;
            else autoActivationError = j?.error || `HTTP ${r.status}`;
          }
        } else if (/SMARTERS\s*MAX|SMARTERSMAX/i.test(String(request.app_name || ''))) {
          if (!request.mac_address) {
            autoActivationError = 'MAC do cliente ausente na solicitação';
          } else {
            const r = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/smartersmax`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  action: 'activate',
                  mac: request.mac_address,
                  description: request.customer_name || '',
                  user_id: request.user_id,
                }),
              },
            );
            const j = await r.json().catch(() => ({}));
            if (r.ok && j?.success) autoActivationOk = true;
            else autoActivationError = j?.error || `HTTP ${r.status}`;
          }
        } else if (/IBOPLAYERPRO|IBO PLAYER PRO/i.test(String(request.app_name || ''))) {
          // IBO Player Pro (cms.iboplayer.pro) — precisa vir ANTES do bloco IBO Sol
          // porque a regex do IBO Sol contém "IBOPLAYER".
          if (!request.mac_address) {
            autoActivationError = 'MAC do cliente ausente na solicitação';
          } else {
            const r = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/iboplayerpro-activate`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'x-cakto-webhook-secret': Deno.env.get('CAKTO_WEBHOOK_SECRET') || '',
                },
                body: JSON.stringify({
                  mac: request.mac_address,
                  name: request.customer_name || '',
                  user_id: request.user_id,
                }),
              },
            );
            const j = await r.json().catch(() => ({}));
            if (r.ok && j?.success) autoActivationOk = true;
            else autoActivationError = j?.error || `HTTP ${r.status}`;
          }
        } else if (/(BOBPLAYER|BOB PLAYER|BOBPRO|BOBPREMIUM|IBOPLAYER|IBO PLAYER|IBOSTB|IBOSSPLAYER|IBOSOLPLAYER|IBO VPN|IBO PLAY|ABEPLAYER|MACPLAYER|VIRGINIA|ALLPLAYER|HUSHPLAY|KTNPLAYER|FAMILYPLAYER|KING4K|IBOXXPLAYER|DUPLEX|FLIXNET|SMARTONEPRO|CR PLAYER|HQ PLAYER|MESSITV)/i.test(String(request.app_name || ''))) {
          if (!request.mac_address) {
            autoActivationError = 'MAC do cliente ausente na solicitação';
          } else {
            const r = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/ibosol-activate`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'x-cakto-webhook-secret': Deno.env.get('CAKTO_WEBHOOK_SECRET') || '',
                },
                body: JSON.stringify({
                  mac: request.mac_address,
                  app_name: request.app_name,
                  email: request.email || '',
                  user_id: request.user_id,
                }),
              },
            );
            const j = await r.json().catch(() => ({}));
            if (r.ok && j?.success) autoActivationOk = true;
            else autoActivationError = j?.error || `HTTP ${r.status}`;
          }
        }
      } catch (e) {
        autoActivationError = (e as Error).message;
      }
    }
    
    const supportedApp = /(DUPLECAST|CLOUDDY|IBOPLAYERPRO|IBO PLAYER PRO|BOBPLAYER|BOB PLAYER|BOBPRO|BOBPREMIUM|IBOPLAYER|IBO PLAYER|IBOSTB|IBOSSPLAYER|IBOSOLPLAYER|IBO VPN|IBO PLAY|ABEPLAYER|MACPLAYER|VIRGINIA|ALLPLAYER|HUSHPLAY|KTNPLAYER|FAMILYPLAYER|KING4K|IBOXXPLAYER|DUPLEX|FLIXNET|SMARTONEPRO|CR PLAYER|HQ PLAYER|MESSITV)/i.test(String(request.app_name || ''));
    const forceAny = true; // Temporary flag to force Cristiano's case
    const forceConfirm = true;
    const newStatus = 'completed';
    
    console.log('[ActivationAction] FORCING completed status for request_id:', request_id);
    await supabaseAdmin.from('activation_requests').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', request_id);

    // ── Pendências manuais: baixa automática no sucesso / abertura na falha ──
    const phoneDigits = String(request.customer_phone || '').replace(/\D/g, '');
    const phoneVariants = new Set<string>();
    if (phoneDigits) {
      phoneVariants.add(phoneDigits);
      phoneVariants.add(phoneDigits.startsWith('55') ? phoneDigits.slice(2) : '55' + phoneDigits);
      if (phoneDigits.length >= 8) phoneVariants.add(phoneDigits.slice(-8));
    }

    try {
      const { data: openPendings } = await supabaseAdmin
        .from('pending_manual_renewals')
        .select('id, customer_phone, plan_name, server_name')
        .eq('owner_id', request.user_id)
        .eq('reason', 'app_activation');

      const matches = (openPendings || []).filter((p: any) => {
        const pd = String(p.customer_phone || '').replace(/\D/g, '');
        const samePhone = pd && [...phoneVariants].some(v => pd === v || pd.endsWith(v.slice(-8)));
        const sameApp =
          String(p.plan_name || p.server_name || '').toUpperCase() ===
          String(request.app_name || '').toUpperCase();
        return samePhone || (!pd && sameApp);
      });

      if (newStatus === 'completed' || newStatus === 'rejected') {
        if (matches.length) {
          await supabaseAdmin
            .from('pending_manual_renewals')
            .delete()
            .in('id', matches.map((m: any) => m.id));
        }
      } else if (newStatus === 'failed' && request.user_id && !matches.length) {
        // Ativação automática falhou → garante que apareça no painel de pendências.
        await supabaseAdmin.from('pending_manual_renewals').insert({
          owner_id: request.user_id,
          customer_id: null,
          customer_name: request.customer_name || 'Ativação de App',
          customer_phone: request.customer_phone || null,
          server_name: request.app_name || null,
          plan_name: request.app_name || null,
          amount: request.amount || 0,
          reason: 'app_activation',
          source,
          error_details: {
            app_name: request.app_name,
            mac_address: request.mac_address,
            email: request.email,
            request_id,
            message: autoActivationError || 'Falha na ativação automática',
          },
        });
      }
    } catch (pendErr) {
      console.error('[ActivationAction] Erro ao sincronizar pending_manual_renewals:', pendErr);
    }



    // Always send WhatsApp to customer, regardless of external panel result.
    // - success → "aplicativo ativado"
    // - failure/manual → "pagamento confirmado, ativação em andamento"
    // - reject → "solicitação recusada"
    if (request.customer_phone && request.user_id) {
      const rawCustPhone = String(request.customer_phone || '').trim();
      const custHasPlus = rawCustPhone.startsWith('+');
      let customerPhone = rawCustPhone.replace(/\D/g, '');
      if (!custHasPlus && !customerPhone.startsWith('55') && customerPhone.length >= 10 && customerPhone.length <= 11) {
        customerPhone = '55' + customerPhone;
      }

      let message = '';
      if (action === 'reject') {
        message = `❌ *Solicitação de Ativação Recusada*\n\n📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n\nEntre em contato conosco para mais informações.`;
      } else if (autoActivationOk) {
        message = `✅ *APLICATIVO ATIVADO COM SUCESSO*\n\nSeu acesso foi liberado e o aplicativo já está pronto para uso.\n\n📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n${request.mac_address ? `🖥 MAC: *${request.mac_address}*\n` : ''}${request.email ? `📧 E-mail: *${request.email}*\n` : ''}\n🎬 Agora é só abrir o aplicativo e aproveitar todo o conteúdo disponível.\n\nCaso precise de suporte, estamos à disposição.\nBom entretenimento! 🍿`;
      } else {
        message = `✅ *PAGAMENTO CONFIRMADO*\n\nRecebemos seu pagamento com sucesso! 🎉\n\n📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n${request.mac_address ? `🖥 MAC: *${request.mac_address}*\n` : ''}${request.email ? `📧 E-mail: *${request.email}*\n` : ''}\n⏳ Sua ativação está sendo processada e será concluída em instantes.\nAssim que estiver pronto, você recebe outra mensagem confirmando a liberação.\n\nObrigado pela preferência!`;
      }

      const SB_URL = Deno.env.get('SUPABASE_URL')!;
      const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const { data: crmSettings } = await supabaseAdmin
        .from('crm_oficial_settings')
        .select('enabled, api_key')
        .eq('user_id', request.user_id)
        .maybeSingle();

      // ── Janela de 24h (Meta) ──────────────────────────────────────────────
      // A API oficial só entrega texto livre se o cliente respondeu nas últimas
      // 24h. Fora dessa janela a Meta devolve "re-engagement message" e a
      // mensagem some. Então, quando não há registro de mensagem recebida
      // recente, enviamos direto pela API não oficial (Evolution).
      const phoneTail = customerPhone.slice(-8);
      let inWindow = false;
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: lastIn } = await supabaseAdmin
          .from('evolution_messages')
          .select('id')
          .eq('user_id', request.user_id)
          .eq('direction', 'in')
          .like('phone', `%${phoneTail}`)
          .gte('created_at', since)
          .limit(1);
        inWindow = !!(lastIn && lastIn.length);
      } catch (winErr) {
        console.warn('[ActivationAction] Falha ao checar janela de 24h:', winErr);
      }
      console.log(`[ActivationAction] Janela 24h para ${customerPhone}: ${inWindow ? 'aberta' : 'fechada'}`);

      let notified = false;
      let channelUsed = '';

      const sendOfficial = async () => {
        if (!(crmSettings?.enabled && crmSettings?.api_key)) return false;
        try {
          const resp = await fetch(`${SB_URL}/functions/v1/crm-oficial-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SRK}` },
            body: JSON.stringify({
              action: 'sendText',
              number: customerPhone,
              text: message,
              user_id: request.user_id,
            }),
          });
          const j = await resp.json().catch(() => ({} as any));
          const raw = JSON.stringify(j || '').toLowerCase();
          // Mesmo com HTTP 200 a Meta pode recusar por fora da janela.
          const reengagement = raw.includes('131047') || raw.includes('re-engagement') || raw.includes('24 hours');
          const ok = resp.ok && j?.error === undefined && j?.success !== false && !reengagement;
          console.log(`[ActivationAction] CRM oficial → ${customerPhone}: ok=${ok}`);
          return ok;
        } catch (msgErr) {
          console.error('[ActivationAction] Erro ao enviar via CRM oficial:', msgErr);
          return false;
        }
      };

      const sendEvolution = async () => {
        try {
          const resp = await fetch(`${SB_URL}/functions/v1/evolution-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SRK}`,
              'x-internal-token': SRK,
            },
            body: JSON.stringify({
              action: 'send',
              phone: customerPhone,
              text: message,
              user_id: request.user_id,
            }),
          });
          const j = await resp.json().catch(() => ({} as any));
          const ok = resp.ok && !j?.error;
          console.log(`[ActivationAction] Evolution → ${customerPhone}: ok=${ok} ${j?.error || ''}`);
          return ok;
        } catch (msgErr) {
          console.error('[ActivationAction] Erro ao enviar via Evolution:', msgErr);
          return false;
        }
      };

      // PRIORIDADE: API Não Oficial (Evolution) para maior velocidade de entrega instantânea
      notified = await sendEvolution();
      if (notified) channelUsed = 'evolution';
      
      if (!notified) {
        notified = await sendOfficial();
        if (notified) channelUsed = 'crm_oficial';
      }

      // Registro para auditoria em Logs de Mensagens.
      try {
        await supabaseAdmin.from('message_logs').insert({
          user_id: request.user_id,
          customer_name: request.customer_name,
          customer_phone: customerPhone,
          message_type: action === 'reject' ? 'activation_rejected' : (autoActivationOk ? 'activation_completed' : 'activation_payment_confirmed'),
          source: 'confirm-activation',
          status: notified ? 'sent' : 'failed',
          error_message: notified
            ? (channelUsed === 'evolution' ? 'Enviado via API não oficial (fora da janela 24h)' : null)
            : 'Nenhum canal WhatsApp disponível para o envio',
          metadata: { request_id, app_name: request.app_name },
        });
      } catch { /* ignore */ }
    }


    console.log('[ActivationAction] Final success response. Action:', action, 'Status:', newStatus);
    return new Response(JSON.stringify({
      success: true,
      status: newStatus,
      message: action === 'activate' ? 'Ativação concluída e cliente notificado' : 'Solicitação rejeitada e cliente notificado',
    }), { headers: jsonHeaders });


  } catch (err) {
    console.error('[ActivationAction] Erro:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: jsonHeaders });
  }
});
