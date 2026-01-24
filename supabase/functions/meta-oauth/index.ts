import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_APP_ID = Deno.env.get('META_APP_ID')!;
const META_APP_SECRET = Deno.env.get('META_APP_SECRET')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ========================================
    // GET: Callback do OAuth do Facebook
    // ========================================
    if (req.method === 'GET') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state'); // user_id encoded
      const error = url.searchParams.get('error');

      if (error) {
        console.error('[Meta OAuth] Error from Facebook:', error);
        return new Response(`
          <html>
            <body>
              <script>
                window.opener.postMessage({ type: 'META_OAUTH_ERROR', error: '${error}' }, '*');
                window.close();
              </script>
              <p>Erro na autenticação. Fechando...</p>
            </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (!code || !state) {
        return new Response('Missing code or state', { status: 400, headers: corsHeaders });
      }

      console.log('[Meta OAuth] Received code, exchanging for token...');

      // Decode state to get user_id and redirect_uri
      let stateData;
      try {
        stateData = JSON.parse(atob(state));
      } catch {
        return new Response('Invalid state', { status: 400, headers: corsHeaders });
      }

      const userId = stateData.user_id;
      const redirectUri = `${supabaseUrl}/functions/v1/meta-oauth`;

      // Exchange code for access token
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?` +
        `client_id=${META_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${META_APP_SECRET}` +
        `&code=${code}`,
        { method: 'GET' }
      );

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('[Meta OAuth] Token exchange failed:', errorText);
        return new Response(`
          <html>
            <body>
              <script>
                window.opener.postMessage({ type: 'META_OAUTH_ERROR', error: 'Token exchange failed' }, '*');
                window.close();
              </script>
              <p>Erro ao trocar token. Fechando...</p>
            </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const tokenData = await tokenResponse.json();
      const shortLivedToken = tokenData.access_token;

      console.log('[Meta OAuth] Got short-lived token, exchanging for long-lived...');

      // Exchange for long-lived token
      const longLivedResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&fb_exchange_token=${shortLivedToken}`,
        { method: 'GET' }
      );

      const longLivedData = await longLivedResponse.json();
      const accessToken = longLivedData.access_token;
      const expiresIn = longLivedData.expires_in || 5184000; // ~60 days default

      console.log('[Meta OAuth] Got long-lived token, expires in:', expiresIn, 'seconds');

      // Get user info
      const meResponse = await fetch(
        `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`
      );
      const meData = await meResponse.json();

      // Calculate expiration
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Save to database
      const { data: existingSettings } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const settingsPayload = {
        user_id: userId,
        api_type: 'meta_cloud',
        meta_access_token: accessToken,
        meta_token_expires_at: expiresAt.toISOString(),
        meta_user_id: meData.id,
        meta_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existingSettings) {
        await supabase
          .from('zap_responder_settings')
          .update(settingsPayload)
          .eq('user_id', userId);
      } else {
        await supabase
          .from('zap_responder_settings')
          .insert(settingsPayload);
      }

      console.log('[Meta OAuth] Settings saved for user:', userId);

      // Success - close popup and notify parent
      return new Response(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ 
                type: 'META_OAUTH_SUCCESS', 
                data: { 
                  userId: '${meData.id}',
                  name: '${meData.name || ''}'
                } 
              }, '*');
              window.close();
            </script>
            <p>Conectado com sucesso! Fechando...</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // ========================================
    // POST: Get OAuth URL or other actions
    // ========================================
    if (req.method === 'POST') {
      const body = await req.json();
      const action = body.action;

      // Validate auth
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: claims, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !claims?.user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userId = claims.user.id;

      // ========================================
      // ACTION: get_oauth_url
      // ========================================
      if (action === 'get_oauth_url') {
        // Use the frontend callback URL instead of edge function URL
        const appUrl = body.app_url || 'https://iply-flow.lovable.app';
        const redirectUri = `${appUrl}/meta-callback`;
        const state = btoa(JSON.stringify({ user_id: userId }));
        
        // Required scopes for WhatsApp Business
        const scopes = [
          'whatsapp_business_management',
          'whatsapp_business_messaging',
          'business_management',
        ].join(',');

        const oauthUrl = 
          `https://www.facebook.com/v18.0/dialog/oauth?` +
          `client_id=${META_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&state=${state}` +
          `&scope=${scopes}` +
          `&response_type=code`;

        return new Response(JSON.stringify({ oauth_url: oauthUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ========================================
      // ACTION: exchange_code
      // ========================================
      if (action === 'exchange_code') {
        const { code, state } = body;
        
        if (!code || !state) {
          return new Response(JSON.stringify({ error: 'Missing code or state' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Decode state to get user_id
        let stateData;
        try {
          stateData = JSON.parse(atob(state));
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid state' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const stateUserId = stateData.user_id;
        
        // Verify the user matches
        if (stateUserId !== userId) {
          return new Response(JSON.stringify({ error: 'User mismatch' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // The redirect URI must match exactly what was used to get the code
        const appUrl = body.app_url || 'https://iply-flow.lovable.app';
        const redirectUri = `${appUrl}/meta-callback`;

        console.log('[Meta OAuth] Exchanging code for token with redirect:', redirectUri);

        // Exchange code for access token
        const tokenResponse = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?` +
          `client_id=${META_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&client_secret=${META_APP_SECRET}` +
          `&code=${code}`,
          { method: 'GET' }
        );

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('[Meta OAuth] Token exchange failed:', errorText);
          return new Response(JSON.stringify({ error: 'Token exchange failed', details: errorText }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const tokenData = await tokenResponse.json();
        const shortLivedToken = tokenData.access_token;

        console.log('[Meta OAuth] Got short-lived token, exchanging for long-lived...');

        // Exchange for long-lived token
        const longLivedResponse = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?` +
          `grant_type=fb_exchange_token` +
          `&client_id=${META_APP_ID}` +
          `&client_secret=${META_APP_SECRET}` +
          `&fb_exchange_token=${shortLivedToken}`,
          { method: 'GET' }
        );

        const longLivedData = await longLivedResponse.json();
        const accessToken = longLivedData.access_token;
        const expiresIn = longLivedData.expires_in || 5184000; // ~60 days default

        console.log('[Meta OAuth] Got long-lived token, expires in:', expiresIn, 'seconds');

        // Get user info
        const meResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`
        );
        const meData = await meResponse.json();

        // Calculate expiration
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        // Save to database
        const { data: existingSettings } = await supabase
          .from('zap_responder_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        const settingsPayload = {
          user_id: userId,
          api_type: 'meta_cloud',
          meta_access_token: accessToken,
          meta_token_expires_at: expiresAt.toISOString(),
          meta_user_id: meData.id,
          meta_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (existingSettings) {
          await supabase
            .from('zap_responder_settings')
            .update(settingsPayload)
            .eq('user_id', userId);
        } else {
          await supabase
            .from('zap_responder_settings')
            .insert(settingsPayload);
        }

        console.log('[Meta OAuth] Settings saved for user:', userId);

        return new Response(JSON.stringify({ 
          success: true, 
          userId: meData.id,
          name: meData.name || ''
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ========================================
      // ACTION: get_phone_numbers
      // ========================================
      if (action === 'get_phone_numbers') {
        // Get user's Meta token
        const { data: settings } = await supabase
          .from('zap_responder_settings')
          .select('*')
          .eq('user_id', userId)
          .eq('api_type', 'meta_cloud')
          .maybeSingle();

        if (!settings?.meta_access_token) {
          return new Response(JSON.stringify({ error: 'Not connected to Meta' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const accessToken = settings.meta_access_token;

        // First get the user's business accounts
        const businessesResponse = await fetch(
          `https://graph.facebook.com/v18.0/me/businesses?access_token=${accessToken}`
        );
        const businessesData = await businessesResponse.json();

        console.log('[Meta OAuth] Businesses:', JSON.stringify(businessesData));

        const phoneNumbers: any[] = [];

        // For each business, get WhatsApp Business Accounts
        for (const business of businessesData.data || []) {
          const wabaResponse = await fetch(
            `https://graph.facebook.com/v18.0/${business.id}/owned_whatsapp_business_accounts?access_token=${accessToken}`
          );
          const wabaData = await wabaResponse.json();

          console.log('[Meta OAuth] WABAs for business', business.id, ':', JSON.stringify(wabaData));

          // For each WABA, get phone numbers
          for (const waba of wabaData.data || []) {
            const phonesResponse = await fetch(
              `https://graph.facebook.com/v18.0/${waba.id}/phone_numbers?access_token=${accessToken}`
            );
            const phonesData = await phonesResponse.json();

            console.log('[Meta OAuth] Phones for WABA', waba.id, ':', JSON.stringify(phonesData));

            for (const phone of phonesData.data || []) {
              phoneNumbers.push({
                id: phone.id,
                display_phone_number: phone.display_phone_number,
                verified_name: phone.verified_name,
                quality_rating: phone.quality_rating,
                waba_id: waba.id,
                waba_name: waba.name,
                business_id: business.id,
                business_name: business.name,
              });
            }
          }
        }

        return new Response(JSON.stringify({ phone_numbers: phoneNumbers }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ========================================
      // ACTION: select_phone_number
      // ========================================
      if (action === 'select_phone_number') {
        const { phone_number_id, display_phone, waba_id, business_id } = body;

        await supabase
          .from('zap_responder_settings')
          .update({
            meta_phone_number_id: phone_number_id,
            meta_display_phone: display_phone,
            meta_business_id: business_id,
            instance_name: phone_number_id,
            selected_session_phone: display_phone,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ========================================
      // ACTION: disconnect
      // ========================================
      if (action === 'disconnect') {
        await supabase
          .from('zap_responder_settings')
          .update({
            meta_access_token: null,
            meta_token_expires_at: null,
            meta_user_id: null,
            meta_business_id: null,
            meta_phone_number_id: null,
            meta_display_phone: null,
            meta_connected_at: null,
            instance_name: null,
            selected_session_phone: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ========================================
      // ACTION: get_connection_status
      // ========================================
      if (action === 'get_connection_status') {
        const { data: settings } = await supabase
          .from('zap_responder_settings')
          .select('meta_access_token, meta_token_expires_at, meta_user_id, meta_phone_number_id, meta_display_phone, meta_connected_at, meta_business_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!settings?.meta_access_token) {
          return new Response(JSON.stringify({ connected: false }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check if token is expired
        const expiresAt = new Date(settings.meta_token_expires_at);
        const isExpired = expiresAt < new Date();

        return new Response(JSON.stringify({
          connected: !isExpired,
          expired: isExpired,
          user_id: settings.meta_user_id,
          phone_number_id: settings.meta_phone_number_id,
          display_phone: settings.meta_display_phone,
          connected_at: settings.meta_connected_at,
          expires_at: settings.meta_token_expires_at,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('[Meta OAuth] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
