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

    // ─────────────── Mensagens ao cliente (canal único reutilizável) ───────────────
    const SB_URL = Deno.env.get('SUPABASE_URL')!;
    const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const normalizedPhone = (() => {
      const raw = String(request.customer_phone || '').trim();
      const hasPlus = raw.startsWith('+');
      let p = raw.replace(/\D/g, '');
      if (!hasPlus && !p.startsWith('55') && p.length >= 10 && p.length <= 11) p = '55' + p;
      return p;
    })();

    const infoLines =
      `📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n` +
      `${request.mac_address ? `🖥 MAC: *${request.mac_address}*\n` : ''}` +
      `${request.email ? `📧 E-mail: *${request.email}*\n` : ''}`;

    const buildMessage = (kind: 'received' | 'activated' | 'processing' | 'rejected') => {
      if (kind === 'rejected') {
        return `❌ *Solicitação de Ativação Recusada*\n\n${infoLines}\nEntre em contato conosco para mais informações.`;
      }
      if (kind === 'activated') {
        return `✅ *APLICATIVO ATIVADO COM SUCESSO*\n\nSeu acesso foi liberado e o aplicativo já está pronto para uso.\n\n${infoLines}\n🎬 Agora é só abrir o aplicativo e aproveitar todo o conteúdo disponível.\n\nCaso precise de suporte, estamos à disposição.\nBom entretenimento! 🍿`;
      }
      if (kind === 'received') {
        return `🛎 *PEDIDO RECEBIDO*\n\nRecebemos seu pedido de ativação e já estamos processando! 🎉\n\n${infoLines}\n⏳ A ativação está *em andamento* e leva apenas alguns minutos.\nAssim que estiver liberado, você recebe outra mensagem confirmando.\n\nObrigado pela preferência!`;
      }
      return `✅ *PAGAMENTO CONFIRMADO*\n\nRecebemos seu pagamento com sucesso! 🎉\n\n${infoLines}\n⏳ Sua ativação está sendo processada e será concluída em instantes.\nAssim que estiver pronto, você recebe outra mensagem confirmando a liberação.\n\nObrigado pela preferência!`;
    };

    const sendWhatsApp = async (message: string, logType: string) => {
      if (!normalizedPhone || !request.user_id) return { notified: false, channel: '' };

      const { data: crmSettings } = await supabaseAdmin
        .from('crm_oficial_settings')
        .select('enabled, api_key')
        .eq('user_id', request.user_id)
        .maybeSingle();

      const sendEvolution = async () => {
        try {
          const resp = await fetch(`${SB_URL}/functions/v1/evolution-send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SRK}`, 'x-internal-token': SRK },
            body: JSON.stringify({ action: 'send', phone: normalizedPhone, text: message, user_id: request.user_id }),
          });
          const j = await resp.json().catch(() => ({} as any));
          const ok = resp.ok && !j?.error;
          console.log(`[ActivationAction] Evolution → ${normalizedPhone}: ok=${ok} ${j?.error || ''}`);
          return ok;
        } catch (e) {
          console.error('[ActivationAction] Erro Evolution:', e);
          return false;
        }
      };

      const sendOfficial = async () => {
        if (!(crmSettings?.enabled && crmSettings?.api_key)) return false;
        try {
          const resp = await fetch(`${SB_URL}/functions/v1/crm-oficial-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SRK}` },
            body: JSON.stringify({ action: 'sendText', number: normalizedPhone, text: message, user_id: request.user_id }),
          });
          const j = await resp.json().catch(() => ({} as any));
          const raw = JSON.stringify(j || '').toLowerCase();
          const reengagement = raw.includes('131047') || raw.includes('re-engagement') || raw.includes('24 hours');
          const ok = resp.ok && j?.error === undefined && j?.success !== false && !reengagement;
          console.log(`[ActivationAction] CRM oficial → ${normalizedPhone}: ok=${ok}`);
          return ok;
        } catch (e) {
          console.error('[ActivationAction] Erro CRM oficial:', e);
          return false;
        }
      };

      let notified = await sendEvolution();
      let channel = notified ? 'evolution' : '';
      if (!notified) {
        notified = await sendOfficial();
        channel = notified ? 'crm_oficial' : '';
      }

      try {
        await supabaseAdmin.from('message_logs').insert({
          user_id: request.user_id,
          customer_name: request.customer_name,
          customer_phone: normalizedPhone,
          message_type: logType,
          source: 'confirm-activation',
          status: notified ? 'sent' : 'failed',
          error_message: notified ? null : 'Nenhum canal WhatsApp disponível para o envio',
          metadata: { request_id, app_name: request.app_name },
        });
      } catch { /* ignore */ }

      return { notified, channel };
    };

    // ── Reenviar confirmação (botão em Apps) ──
    if (action === 'resend') {
      if (!normalizedPhone) {
        return new Response(JSON.stringify({ error: 'Cliente sem WhatsApp cadastrado nesta solicitação' }), { status: 400, headers: jsonHeaders });
      }
      const kind =
        request.status === 'rejected' ? 'rejected'
        : ['completed', 'activated'].includes(String(request.status)) ? 'activated'
        : 'processing';
      const r = await sendWhatsApp(buildMessage(kind as any), 'activation_resend');
      return new Response(JSON.stringify({
        success: r.notified,
        error: r.notified ? undefined : 'Nenhum canal WhatsApp disponível para o envio',
        message: r.notified ? 'Confirmação reenviada ao cliente' : undefined,
      }), { headers: jsonHeaders });
    }

    // ── Aviso imediato de "pedido em andamento" para painéis lentos (Duplecast) ──
    if (action === 'activate' && normalizedPhone && /DUPLECAST/i.test(String(request.app_name || '')) && !['completed', 'activated'].includes(String(request.status))) {
      await sendWhatsApp(buildMessage('received'), 'activation_received');
    }


    // ── Auto-activate on external panel when applicable (Duplecast / Clouddy) ──
    // Painéis lentos (Duplecast usa automação de navegador) podiam travar a função
    // inteira até o limite de execução: o pedido ficava preso em "pago", sem
    // pendência e sem aviso ao cliente. Todo chamado externo agora tem tempo limite.
    const PANEL_TIMEOUT_MS = 60000;
    const panelFetch = async (url: string, init: RequestInit, ms = PANEL_TIMEOUT_MS) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try {
        return await fetch(url, { ...init, signal: ctrl.signal });
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          throw new Error(`O painel não respondeu em ${Math.round(ms / 1000)}s. Ative manualmente e use "Avisar ativado".`);
        }
        throw e;
      } finally {
        clearTimeout(t);
      }
    };

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
            const r = await panelFetch(
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
            const r = await panelFetch(
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
            const r = await panelFetch(
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
            const r = await panelFetch(
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
            const r = await panelFetch(
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

    // Nunca marcar como concluído quando a ativação automática falhou:
    // isso escondia falhas (ex.: IBO Player Pro) e o cliente ficava sem ativação.
    const autoAttempted = action === 'activate' && supportedApp && !!request.user_id;
    const newStatus =
      action !== 'activate'
        ? 'rejected'
        : autoAttempted && !autoActivationOk && !force
          ? 'failed'
          : 'completed';

    console.log('[ActivationAction] status:', newStatus, 'err:', autoActivationError, 'request_id:', request_id);
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



    // Mensagem final ao cliente (sucesso, em andamento ou recusa).
    if (normalizedPhone && request.user_id) {
      const kind = action === 'reject' ? 'rejected' : autoActivationOk ? 'activated' : 'processing';
      const logType =
        action === 'reject' ? 'activation_rejected' : autoActivationOk ? 'activation_completed' : 'activation_payment_confirmed';
      await sendWhatsApp(buildMessage(kind as any), logType);
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
