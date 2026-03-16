import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_APP_ID = Deno.env.get('META_APP_ID');
const META_APP_SECRET = Deno.env.get('META_APP_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface MetaBusiness {
  id: string;
  name?: string;
}

interface MetaWaba {
  id: string;
  name?: string;
  account_review_status?: string;
}

interface MetaWabaReference {
  business_id: string;
  business_name: string;
  waba_id: string;
  waba_name: string;
  account_review_status: string;
}

interface MetaPhoneNumberWithWaba {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
  waba_id: string;
  waba_name: string;
  business_id: string;
  business_name: string;
  account_review_status: string;
}

interface MetaTemplateWithWaba {
  name: string;
  status: string;
  language: string;
  category: string;
  components?: any[];
  waba_id: string;
  waba_name: string;
  business_id: string;
  business_name: string;
  account_review_status: string;
}

// Generate appsecret_proof for secure Graph API calls
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

async function fetchPagedGraph<T>(initialUrl: URL | string): Promise<T[]> {
  const output: T[] = [];
  let nextUrl: string | null = typeof initialUrl === 'string' ? initialUrl : initialUrl.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl);
    const data = await response.json();

    if (data?.error) {
      throw new Error(data.error.message || 'Erro na API da Meta');
    }

    if (Array.isArray(data?.data)) {
      output.push(...(data.data as T[]));
    }

    nextUrl = data?.paging?.next ?? null;
  }

  return output;
}

function sortWabasByPriority(wabas: MetaWabaReference[]): MetaWabaReference[] {
  return [...wabas]
    .filter((waba) => waba.account_review_status?.toUpperCase() !== 'REJECTED')
    .sort((a, b) => {
      const aApproved = a.account_review_status?.toUpperCase() === 'APPROVED' ? 1 : 0;
      const bApproved = b.account_review_status?.toUpperCase() === 'APPROVED' ? 1 : 0;

      if (aApproved !== bApproved) return bApproved - aApproved;
      return `${a.business_name}:${a.waba_name}`.localeCompare(`${b.business_name}:${b.waba_name}`);
    });
}

async function fetchAllAccessibleWabas(accessToken: string, appSecretProof: string): Promise<MetaWabaReference[]> {
  const businessesUrl = new URL(`${GRAPH_BASE_URL}/me/businesses`);
  businessesUrl.searchParams.set('access_token', accessToken);
  businessesUrl.searchParams.set('appsecret_proof', appSecretProof);
  businessesUrl.searchParams.set('fields', 'id,name');
  businessesUrl.searchParams.set('limit', '100');

  const businesses = await fetchPagedGraph<MetaBusiness>(businessesUrl);
  if (!businesses.length) return [];

  const wabasByBusiness = await Promise.all(
    businesses.map(async (business) => {
      const ownedWabasUrl = new URL(`${GRAPH_BASE_URL}/${business.id}/owned_whatsapp_business_accounts`);
      ownedWabasUrl.searchParams.set('access_token', accessToken);
      ownedWabasUrl.searchParams.set('appsecret_proof', appSecretProof);
      ownedWabasUrl.searchParams.set('fields', 'id,name,account_review_status');
      ownedWabasUrl.searchParams.set('limit', '100');

      const wabas = await fetchPagedGraph<MetaWaba>(ownedWabasUrl);
      return wabas.map((waba) => ({
        business_id: business.id,
        business_name: business.name || 'Sem nome',
        waba_id: waba.id,
        waba_name: waba.name || 'Sem nome',
        account_review_status: waba.account_review_status || 'UNKNOWN',
      }));
    })
  );

  return sortWabasByPriority(wabasByBusiness.flat());
}

async function fetchAllPhonesFromWabas(
  accessToken: string,
  appSecretProof: string,
  wabas: MetaWabaReference[]
): Promise<MetaPhoneNumberWithWaba[]> {
  if (!wabas.length) return [];

  const phoneResults = await Promise.all(
    wabas.map(async (waba) => {
      const phonesUrl = new URL(`${GRAPH_BASE_URL}/${waba.waba_id}/phone_numbers`);
      phonesUrl.searchParams.set('access_token', accessToken);
      phonesUrl.searchParams.set('appsecret_proof', appSecretProof);
      phonesUrl.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type');
      phonesUrl.searchParams.set('limit', '100');

      const phones = await fetchPagedGraph<Omit<MetaPhoneNumberWithWaba, 'waba_id' | 'waba_name' | 'business_id' | 'business_name' | 'account_review_status'>>(phonesUrl);
      return phones.map((phone) => ({
        ...phone,
        waba_id: waba.waba_id,
        waba_name: waba.waba_name,
        business_id: waba.business_id,
        business_name: waba.business_name,
        account_review_status: waba.account_review_status,
      }));
    })
  );

  return phoneResults.flat();
}

async function fetchAllTemplatesFromWabas(
  accessToken: string,
  appSecretProof: string,
  wabas: MetaWabaReference[]
): Promise<MetaTemplateWithWaba[]> {
  if (!wabas.length) return [];

  const templateResults = await Promise.all(
    wabas.map(async (waba) => {
      const templatesUrl = new URL(`${GRAPH_BASE_URL}/${waba.waba_id}/message_templates`);
      templatesUrl.searchParams.set('access_token', accessToken);
      templatesUrl.searchParams.set('appsecret_proof', appSecretProof);
      templatesUrl.searchParams.set('fields', 'name,status,language,category,components');
      templatesUrl.searchParams.set('limit', '100');

      const templates = await fetchPagedGraph<Omit<MetaTemplateWithWaba, 'waba_id' | 'waba_name' | 'business_id' | 'business_name' | 'account_review_status'>>(templatesUrl);
      return templates.map((template) => ({
        ...template,
        waba_id: waba.waba_id,
        waba_name: waba.waba_name,
        business_id: waba.business_id,
        business_name: waba.business_name,
        account_review_status: waba.account_review_status,
      }));
    })
  );

  const deduped = new Map<string, MetaTemplateWithWaba>();
  for (const template of templateResults.flat()) {
    const key = `${template.waba_id}:${template.name}:${template.language}`;
    if (!deduped.has(key)) deduped.set(key, template);
  }

  return Array.from(deduped.values());
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

    if (action === 'exchange-token' || action === 'exchange-sdk-token') {
      // Supports two flows:
      // 1) exchange-token: receives authorization code + redirect_uri
      // 2) exchange-sdk-token: receives short-lived access token from Facebook JS SDK
      let shortLivedToken: string | undefined;

      if (action === 'exchange-token') {
        console.log('[meta-oauth] Exchanging code for access token...');
        console.log('[meta-oauth] redirect_uri received:', redirect_uri);

        if (!code || typeof code !== 'string') {
          return new Response(JSON.stringify({
            error: 'code ausente ou inválido',
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

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

        shortLivedToken = tokenData.access_token;
      } else {
        shortLivedToken = body?.access_token;

        if (!shortLivedToken || typeof shortLivedToken !== 'string') {
          return new Response(JSON.stringify({
            error: 'access_token ausente ou inválido',
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('[meta-oauth] Using short-lived token from Facebook JS SDK');
      }

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

      const wabas = await fetchAllAccessibleWabas(accessToken, appSecretProof);
      console.log('[meta-oauth] Accessible WABAs:', JSON.stringify(wabas, null, 2));

      const phones = await fetchAllPhonesFromWabas(accessToken, appSecretProof, wabas);
      console.log('[meta-oauth] All phone numbers found:', JSON.stringify(phones, null, 2));

      const selectedPhone = phones[0] || null;
      const selectedWaba = selectedPhone
        ? wabas.find((waba) => waba.waba_id === selectedPhone.waba_id) || null
        : wabas[0] || null;

      const wabaId = selectedWaba?.waba_id ?? null;
      const phoneNumberId = selectedPhone?.id ?? null;
      const displayPhone = selectedPhone?.display_phone_number ?? null;

      if (selectedPhone) {
        console.log(
          '[meta-oauth] Selected default phone:',
          displayPhone,
          'ID:',
          phoneNumberId,
          'WABA:',
          wabaId,
          `(${selectedWaba?.waba_name || 'Sem nome'})`
        );
      } else if (selectedWaba) {
        console.log('[meta-oauth] No phones found, keeping WABA:', selectedWaba.waba_id, selectedWaba.waba_name);
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
      // Fetch all available phone numbers across all accessible WABAs
      const { data: settings } = await supabase
        .from('zap_responder_settings')
        .select('meta_access_token')
        .eq('user_id', userId)
        .maybeSingle();

      if (!settings?.meta_access_token) {
        return new Response(JSON.stringify({
          error: 'Conta Meta não conectada'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const appSecretProof = await generateAppSecretProofAsync(settings.meta_access_token, META_APP_SECRET);
      const wabas = await fetchAllAccessibleWabas(settings.meta_access_token, appSecretProof);
      const phoneNumbers = await fetchAllPhonesFromWabas(settings.meta_access_token, appSecretProof, wabas);

      return new Response(JSON.stringify({
        success: true,
        waba_count: wabas.length,
        phone_numbers: phoneNumbers,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'select-phone') {
      const { phone_number_id, display_phone, waba_id } = body;

      if (!phone_number_id || !waba_id) {
        return new Response(JSON.stringify({
          error: 'phone_number_id e waba_id são obrigatórios'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: updateError } = await supabase
        .from('zap_responder_settings')
        .update({
          meta_business_id: waba_id,
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
        waba_id,
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
