import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_APP_ID = Deno.env.get('META_APP_ID');
const META_APP_SECRET = Deno.env.get('META_APP_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Generate appsecret_proof for secure Graph API calls
function generateAppSecretProof(accessToken: string, appSecret: string): string {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const messageData = encoder.encode(accessToken);
  
  // Using Web Crypto API for HMAC-SHA256
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, messageData)
  ).then(signature => 
    Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  ) as unknown as string;
}

async function generateAppSecretProofAsync(accessToken: string, appSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const messageData = encoder.encode(accessToken);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      console.error('Auth error:', claimsError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const userId = claimsData.user.id;
    const body = await req.json();
    const { action, code, redirect_uri } = body;

    console.log(`[meta-oauth] Action: ${action}, User: ${userId}`);

    if (!META_APP_ID || !META_APP_SECRET) {
      console.error('[meta-oauth] Missing META_APP_ID or META_APP_SECRET');
      return new Response(JSON.stringify({ 
        error: 'Configuração incompleta. META_APP_ID ou META_APP_SECRET não configurados.' 
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'exchange-token') {
      // Exchange short-lived token for long-lived token
      console.log('[meta-oauth] Exchanging code for access token...');

      console.log('[meta-oauth] redirect_uri received:', redirect_uri);

      if (!redirect_uri || typeof redirect_uri !== 'string') {
        return new Response(JSON.stringify({
          error: 'redirect_uri ausente ou inválida',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', META_APP_ID);
      tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
      tokenUrl.searchParams.set('code', code);
      tokenUrl.searchParams.set('redirect_uri', redirect_uri);

      const tokenResponse = await fetch(tokenUrl.toString());
      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error('[meta-oauth] Token exchange error:', tokenData.error);
        return new Response(JSON.stringify({ 
          error: tokenData.error.message || 'Erro ao trocar código por token',
          meta_error: tokenData.error,
          debug_redirect_uri: redirect_uri,
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const shortLivedToken = tokenData.access_token;
      console.log('[meta-oauth] Got short-lived token, exchanging for long-lived...');

      // Exchange for long-lived token
      const longLivedUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
      longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longLivedUrl.searchParams.set('client_id', META_APP_ID);
      longLivedUrl.searchParams.set('client_secret', META_APP_SECRET);
      longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

      const longLivedResponse = await fetch(longLivedUrl.toString());
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.error) {
        console.error('[meta-oauth] Long-lived token error:', longLivedData.error);
        return new Response(JSON.stringify({ 
          error: longLivedData.error.message || 'Erro ao obter token de longa duração' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const accessToken = longLivedData.access_token;
      const expiresIn = longLivedData.expires_in || 5184000; // ~60 days default
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      console.log('[meta-oauth] Got long-lived token, fetching WABA details...');

      // Generate appsecret_proof for secure API calls
      const appSecretProof = await generateAppSecretProofAsync(accessToken, META_APP_SECRET);

      // Fetch user info
      const meUrl = new URL('https://graph.facebook.com/v21.0/me');
      meUrl.searchParams.set('access_token', accessToken);
      meUrl.searchParams.set('appsecret_proof', appSecretProof);
      meUrl.searchParams.set('fields', 'id,name');

      const meResponse = await fetch(meUrl.toString());
      const meData = await meResponse.json();
      console.log('[meta-oauth] User info:', meData);

      // Fetch WABA (WhatsApp Business Accounts)
      const wabaUrl = new URL('https://graph.facebook.com/v21.0/me/businesses');
      wabaUrl.searchParams.set('access_token', accessToken);
      wabaUrl.searchParams.set('appsecret_proof', appSecretProof);
      wabaUrl.searchParams.set('fields', 'id,name,owned_whatsapp_business_accounts{id,name,account_review_status,on_behalf_of_business_info}');

      const wabaResponse = await fetch(wabaUrl.toString());
      const wabaData = await wabaResponse.json();
      console.log('[meta-oauth] WABA data:', JSON.stringify(wabaData, null, 2));

      let wabaId = null;
      let phoneNumberId = null;
      let displayPhone = null;

      // Find first WABA
      if (wabaData.data && wabaData.data.length > 0) {
        for (const business of wabaData.data) {
          if (business.owned_whatsapp_business_accounts?.data?.length > 0) {
            const waba = business.owned_whatsapp_business_accounts.data[0];
            wabaId = waba.id;
            console.log('[meta-oauth] Found WABA:', wabaId);

            // Fetch phone numbers for this WABA
            const phonesUrl = new URL(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`);
            phonesUrl.searchParams.set('access_token', accessToken);
            phonesUrl.searchParams.set('appsecret_proof', appSecretProof);

            const phonesResponse = await fetch(phonesUrl.toString());
            const phonesData = await phonesResponse.json();
            console.log('[meta-oauth] Phone numbers:', JSON.stringify(phonesData, null, 2));

            if (phonesData.data && phonesData.data.length > 0) {
              phoneNumberId = phonesData.data[0].id;
              displayPhone = phonesData.data[0].display_phone_number;
              console.log('[meta-oauth] Found phone:', displayPhone, 'ID:', phoneNumberId);
            }
            break;
          }
        }
      }

      // Save to database
      const updatePayload = {
        user_id: userId,
        api_type: 'meta_cloud',
        meta_access_token: accessToken,
        meta_token_expires_at: tokenExpiresAt,
        meta_user_id: meData.id,
        meta_business_id: wabaId,
        meta_phone_number_id: phoneNumberId,
        meta_display_phone: displayPhone,
        meta_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Check if settings exist
      const { data: existingSettings } = await supabase
        .from('zap_responder_settings')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingSettings) {
        const { error: updateError } = await supabase
          .from('zap_responder_settings')
          .update(updatePayload)
          .eq('user_id', userId);

        if (updateError) {
          console.error('[meta-oauth] Update error:', updateError);
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase
          .from('zap_responder_settings')
          .insert(updatePayload);

        if (insertError) {
          console.error('[meta-oauth] Insert error:', insertError);
          throw insertError;
        }
      }

      console.log('[meta-oauth] Successfully saved Meta credentials');

      return new Response(JSON.stringify({
        success: true,
        meta_user_id: meData.id,
        meta_user_name: meData.name,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone: displayPhone,
        token_expires_at: tokenExpiresAt,
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'fetch-phone-numbers') {
      // Fetch available phone numbers for the connected account
      const { data: settings } = await supabase
        .from('zap_responder_settings')
        .select('meta_access_token, meta_business_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!settings?.meta_access_token || !settings?.meta_business_id) {
        return new Response(JSON.stringify({ 
          error: 'Conta Meta não conectada' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const appSecretProof = await generateAppSecretProofAsync(settings.meta_access_token, META_APP_SECRET);

      const phonesUrl = new URL(`https://graph.facebook.com/v21.0/${settings.meta_business_id}/phone_numbers`);
      phonesUrl.searchParams.set('access_token', settings.meta_access_token);
      phonesUrl.searchParams.set('appsecret_proof', appSecretProof);
      phonesUrl.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating,code_verification_status');

      const phonesResponse = await fetch(phonesUrl.toString());
      const phonesData = await phonesResponse.json();

      if (phonesData.error) {
        console.error('[meta-oauth] Phone fetch error:', phonesData.error);
        return new Response(JSON.stringify({ 
          error: phonesData.error.message || 'Erro ao buscar números' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({
        success: true,
        phone_numbers: phonesData.data || [],
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'select-phone') {
      const { phone_number_id, display_phone } = body;

      const { error: updateError } = await supabase
        .from('zap_responder_settings')
        .update({
          meta_phone_number_id: phone_number_id,
          meta_display_phone: display_phone,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[meta-oauth] Select phone error:', updateError);
        throw updateError;
      }

      return new Response(JSON.stringify({
        success: true,
        phone_number_id,
        display_phone,
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'disconnect') {
      const { error: updateError } = await supabase
        .from('zap_responder_settings')
        .update({
          api_type: 'zap_responder',
          meta_access_token: null,
          meta_token_expires_at: null,
          meta_user_id: null,
          meta_business_id: null,
          meta_phone_number_id: null,
          meta_display_phone: null,
          meta_connected_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[meta-oauth] Disconnect error:', updateError);
        throw updateError;
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Conta Meta desconectada',
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'fetch-templates') {
      // Fetch message templates for the connected WABA
      const { data: settings } = await supabase
        .from('zap_responder_settings')
        .select('meta_access_token, meta_business_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!settings?.meta_access_token || !settings?.meta_business_id) {
        return new Response(JSON.stringify({ 
          error: 'Conta Meta não conectada' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const appSecretProof = await generateAppSecretProofAsync(settings.meta_access_token, META_APP_SECRET);

      const templatesUrl = new URL(`https://graph.facebook.com/v21.0/${settings.meta_business_id}/message_templates`);
      templatesUrl.searchParams.set('access_token', settings.meta_access_token);
      templatesUrl.searchParams.set('appsecret_proof', appSecretProof);
      templatesUrl.searchParams.set('fields', 'name,status,language,category,components');
      templatesUrl.searchParams.set('limit', '100');

      const templatesResponse = await fetch(templatesUrl.toString());
      const templatesData = await templatesResponse.json();

      console.log('[meta-oauth] Templates response:', JSON.stringify(templatesData, null, 2));

      if (templatesData.error) {
        console.error('[meta-oauth] Templates fetch error:', templatesData.error);
        return new Response(JSON.stringify({ 
          error: templatesData.error.message || 'Erro ao buscar templates' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({
        success: true,
        templates: templatesData.data || [],
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'fetch-waba-users') {
      // Fetch users/agents assigned to the WABA
      const { data: settings } = await supabase
        .from('zap_responder_settings')
        .select('meta_access_token, meta_business_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!settings?.meta_access_token || !settings?.meta_business_id) {
        return new Response(JSON.stringify({ 
          error: 'Conta Meta não conectada' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const appSecretProof = await generateAppSecretProofAsync(settings.meta_access_token, META_APP_SECRET);

      const usersUrl = new URL(`https://graph.facebook.com/v21.0/${settings.meta_business_id}/assigned_users`);
      usersUrl.searchParams.set('access_token', settings.meta_access_token);
      usersUrl.searchParams.set('appsecret_proof', appSecretProof);
      usersUrl.searchParams.set('fields', 'id,name,tasks,business{id,name}');

      const usersResponse = await fetch(usersUrl.toString());
      const usersData = await usersResponse.json();

      console.log('[meta-oauth] WABA Users response:', JSON.stringify(usersData, null, 2));

      if (usersData.error) {
        console.error('[meta-oauth] Users fetch error:', usersData.error);
        return new Response(JSON.stringify({ 
          error: usersData.error.message || 'Erro ao buscar atendentes' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({
        success: true,
        users: usersData.data || [],
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'assign-waba-user') {
      // Assign a user to the WABA
      const { user_email, tasks } = body;

      if (!user_email) {
        return new Response(JSON.stringify({ 
          error: 'Email do usuário é obrigatório' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const { data: settings } = await supabase
        .from('zap_responder_settings')
        .select('meta_access_token, meta_business_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!settings?.meta_access_token || !settings?.meta_business_id) {
        return new Response(JSON.stringify({ 
          error: 'Conta Meta não conectada' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const appSecretProof = await generateAppSecretProofAsync(settings.meta_access_token, META_APP_SECRET);

      // First, we need to get the user ID from email via the business
      // This requires inviting via the Business Manager API
      const assignUrl = new URL(`https://graph.facebook.com/v21.0/${settings.meta_business_id}/assigned_users`);
      
      const assignResponse = await fetch(assignUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: user_email,
          tasks: tasks || ['MANAGE'],
          access_token: settings.meta_access_token,
          appsecret_proof: appSecretProof,
        }),
      });

      const assignData = await assignResponse.json();

      console.log('[meta-oauth] Assign user response:', JSON.stringify(assignData, null, 2));

      if (assignData.error) {
        console.error('[meta-oauth] Assign user error:', assignData.error);
        return new Response(JSON.stringify({ 
          error: assignData.error.message || 'Erro ao adicionar atendente' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Atendente adicionado com sucesso',
        data: assignData,
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'remove-waba-user') {
      // Remove a user from the WABA
      const { waba_user_id } = body;

      if (!waba_user_id) {
        return new Response(JSON.stringify({ 
          error: 'ID do usuário é obrigatório' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const { data: settings } = await supabase
        .from('zap_responder_settings')
        .select('meta_access_token, meta_business_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!settings?.meta_access_token || !settings?.meta_business_id) {
        return new Response(JSON.stringify({ 
          error: 'Conta Meta não conectada' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const appSecretProof = await generateAppSecretProofAsync(settings.meta_access_token, META_APP_SECRET);

      const removeUrl = new URL(`https://graph.facebook.com/v21.0/${settings.meta_business_id}/assigned_users`);
      removeUrl.searchParams.set('user', waba_user_id);
      removeUrl.searchParams.set('access_token', settings.meta_access_token);
      removeUrl.searchParams.set('appsecret_proof', appSecretProof);

      const removeResponse = await fetch(removeUrl.toString(), {
        method: 'DELETE',
      });

      const removeData = await removeResponse.json();

      console.log('[meta-oauth] Remove user response:', JSON.stringify(removeData, null, 2));

      if (removeData.error) {
        console.error('[meta-oauth] Remove user error:', removeData.error);
        return new Response(JSON.stringify({ 
          error: removeData.error.message || 'Erro ao remover atendente' 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Atendente removido com sucesso',
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Ação não reconhecida' 
    }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error('[meta-oauth] Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Erro interno' 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
