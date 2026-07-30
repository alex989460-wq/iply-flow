import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const requestSchema = z.object({
  id: z.string().uuid(),
});

const responseHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: responseHeaders });
  }

  try {
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Identificador inválido.' }), { status: 400, headers: responseHeaders });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await admin
      .from('payment_confirmations')
      .select('id, customer_name, amount, plan_name, duration_days, new_due_date, status, created_at')
      .eq('id', parsed.data.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return new Response(JSON.stringify({ error: 'Pedido não encontrado.' }), { status: 404, headers: responseHeaders });
    }

    return new Response(JSON.stringify({ data }), { status: 200, headers: responseHeaders });
  } catch {
    return new Response(JSON.stringify({ error: 'Não foi possível consultar o pedido.' }), { status: 500, headers: responseHeaders });
  }
});