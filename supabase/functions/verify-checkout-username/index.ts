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
    const usernameRaw = url.searchParams.get('username') || '';
    const username = usernameRaw.trim();

    if (!ownerId || !username) {
      return new Response(JSON.stringify({ error: 'owner_id and username required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Search customers for this owner - exact match or username present in comma list
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, username, due_date, status')
      .eq('created_by', ownerId)
      .ilike('username', `%${username}%`)
      .limit(20);

    if (error) throw error;

    const u = username.toLowerCase();
    const match = (data || []).find((c: any) => {
      const list = String(c.username || '')
        .split(',')
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean);
      return list.includes(u);
    });

    if (!match) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      found: true,
      customer: {
        name: match.name,
        username: match.username,
        due_date: match.due_date,
        status: match.status,
      },
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
