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
    const { request_id, action } = await req.json();
    
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

    // Update status (block completed if auto-activation failed for a supported app)
    const supportedApp = /(DUPLECAST|CLOUDDY|IBOPLAYERPRO|IBO PLAYER PRO|BOBPLAYER|BOB PLAYER|BOBPRO|BOBPREMIUM|IBOPLAYER|IBO PLAYER|IBOSTB|IBOSSPLAYER|IBOSOLPLAYER|IBO VPN|IBO PLAY|ABEPLAYER|MACPLAYER|VIRGINIA|ALLPLAYER|HUSHPLAY|KTNPLAYER|FAMILYPLAYER|KING4K|IBOXXPLAYER|DUPLEX|FLIXNET|SMARTONEPRO|CR PLAYER|HQ PLAYER|MESSITV)/i.test(String(request.app_name || ''));
    const newStatus =
      action === 'activate'
        ? (supportedApp && !autoActivationOk ? 'failed' : 'completed')
        : 'rejected';
    await supabaseAdmin.from('activation_requests').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', request_id);

    // Auto-clear matching pending_manual_renewals entry when activation succeeded/rejected
    if (newStatus === 'completed' || newStatus === 'rejected') {
      try {
        await supabaseAdmin
          .from('pending_manual_renewals')
          .delete()
          .eq('owner_id', request.user_id)
          .eq('reason', 'app_activation')
          .eq('customer_phone', request.customer_phone);
      } catch (delErr) {
        console.error('[ActivationAction] Erro ao dar baixa em pending_manual_renewals:', delErr);
      }
    }


    if (action === 'activate' && supportedApp && !autoActivationOk) {
      return new Response(JSON.stringify({
        success: false,
        status: newStatus,
        error: `Falha na ativação automática: ${autoActivationError || 'desconhecida'}`,
      }), { status: 502, headers: jsonHeaders });
    }


    // Send WhatsApp message to customer
    if (request.customer_phone && request.user_id) {
      const { data: crmSettings } = await supabaseAdmin
        .from('crm_oficial_settings')
        .select('enabled, api_key')
        .eq('user_id', request.user_id)
        .maybeSingle();

      if (crmSettings?.enabled && crmSettings?.api_key) {
        const rawCustPhone = String(request.customer_phone || '').trim();
        const custHasPlus = rawCustPhone.startsWith('+');
        let customerPhone = rawCustPhone.replace(/\D/g, '');
        if (!custHasPlus && !customerPhone.startsWith('55') && customerPhone.length >= 10 && customerPhone.length <= 11) {
          customerPhone = '55' + customerPhone;
        }

        let message = '';
        if (action === 'activate') {
          message = `✅ *APLICATIVO ATIVADO COM SUCESSO*\n\nSeu acesso foi liberado e o aplicativo já está pronto para uso.\n\n📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n${request.mac_address ? `🖥 MAC: *${request.mac_address}*\n` : ''}${request.email ? `📧 E-mail: *${request.email}*\n` : ''}\n🎬 Agora é só abrir o aplicativo e aproveitar todo o conteúdo disponível.\n\nCaso precise de suporte, estamos à disposição.\nBom entretenimento! 🍿`;
        } else {
          message = `❌ *Solicitação de Ativação Recusada*\n\n📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n\nEntre em contato conosco para mais informações.`;
        }

        try {
          const resp = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/crm-oficial-sync`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                action: 'sendText',
                number: customerPhone,
                text: message,
                user_id: request.user_id,
              }),
            },
          );
          console.log(`[ActivationAction] Mensagem ${action} enviada para ${customerPhone}: ok=${resp.ok}`);
        } catch (msgErr) {
          console.error('[ActivationAction] Erro ao enviar mensagem:', msgErr);
        }
      }
    }

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
