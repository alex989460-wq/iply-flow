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

    // Update status
    const newStatus = action === 'activate' ? 'completed' : 'rejected';
    await supabaseAdmin.from('activation_requests').update({ 
      status: newStatus, 
      updated_at: new Date().toISOString() 
    }).eq('id', request_id);

    // Send WhatsApp message to customer
    if (request.customer_phone && request.user_id) {
      const { data: zapSettings } = await supabaseAdmin
        .from('zap_responder_settings')
        .select('selected_department_id')
        .eq('user_id', request.user_id)
        .maybeSingle();

      if (zapSettings?.selected_department_id) {
        let customerPhone = String(request.customer_phone).replace(/\D/g, '');
        if (!customerPhone.startsWith('55')) customerPhone = '55' + customerPhone;

        let message = '';
        if (action === 'activate') {
          message = `✅ *APLICATIVO ATIVADO COM SUCESSO*\n\nSeu acesso foi liberado e o aplicativo já está pronto para uso.\n\n📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n${request.mac_address ? `🖥 MAC: *${request.mac_address}*\n` : ''}${request.email ? `📧 E-mail: *${request.email}*\n` : ''}\n🎬 Agora é só abrir o aplicativo e aproveitar todo o conteúdo disponível.\n\nCaso precise de suporte, estamos à disposição.\nBom entretenimento! 🍿`;
        } else {
          message = `❌ *Solicitação de Ativação Recusada*\n\n📱 Aplicativo: *${request.app_name}*\n👤 Cliente: *${request.customer_name}*\n\nEntre em contato conosco para mais informações.`;
        }

        try {
          const resp = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                action: 'enviar-mensagem',
                department_id: zapSettings.selected_department_id,
                number: customerPhone,
                text: message,
                user_id: request.user_id,
              }),
            },
          );
          console.log(`[ActivationAction] Mensagem ${action} enviada para ${customerPhone}: ok=${resp.ok}`);

          // Fallback to template if failed
          if (!resp.ok) {
            const { data: billingSettings } = await supabaseAdmin
              .from('billing_settings')
              .select('meta_template_name')
              .eq('user_id', request.user_id)
              .maybeSingle();
            const tplName = billingSettings?.meta_template_name || 'pedido_aprovado';
            await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  action: 'enviar-template',
                  department_id: zapSettings.selected_department_id,
                  template_name: tplName,
                  number: customerPhone,
                  language: 'pt_BR',
                  user_id: request.user_id,
                }),
              },
            );
          }
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
