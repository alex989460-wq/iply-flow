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

  try {
    const url = new URL(req.url);
    const ownerId = url.searchParams.get('owner_id');

    if (!ownerId) {
      return new Response(JSON.stringify({ error: 'owner_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Fetch public servers for this owner
    const { data: servers } = await supabase
      .from('servers')
      .select('id, server_name')
      .eq('created_by', ownerId)
      .eq('is_public', true)
      .eq('status', 'online');

    // Fetch plans with checkout_url for this owner
    const { data: plans } = await supabase
      .from('plans')
      .select('id, plan_name, duration_days, price, checkout_url')
      .eq('created_by', ownerId)
      .neq('checkout_url', '')
      .not('checkout_url', 'is', null)
      .order('price', { ascending: true });

    // Filter plans that actually have a checkout_url
    const publicPlans = (plans || []).filter((p: any) => p.checkout_url && p.checkout_url.trim() !== '');

    // Get owner name for display
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', ownerId)
      .maybeSingle();

    return new Response(JSON.stringify({
      servers: servers || [],
      plans: publicPlans,
      owner_name: profile?.full_name || '',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
