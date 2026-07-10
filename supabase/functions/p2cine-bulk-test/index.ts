// One-shot: renova via p2cine-renew para uma lista de usernames.
// Chama a função p2cine-renew usando o CAKTO_WEBHOOK_SECRET (bypass de auth interno).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jh = { ...cors, "Content-Type": "application/json" };
  try {
    const { usernames, user_id, months = 1 } = await req.json();
    if (!Array.isArray(usernames) || !user_id) {
      return new Response(JSON.stringify({ error: "usernames[] e user_id são obrigatórios" }), { status: 400, headers: jh });
    }
    const secret = Deno.env.get("CAKTO_WEBHOOK_SECRET")!;
    const base = Deno.env.get("SUPABASE_URL")!;
    const results: any[] = [];
    for (const username of usernames) {
      const r = await fetch(`${base}/functions/v1/p2cine-renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cakto-webhook-secret": secret },
        body: JSON.stringify({ username, months, user_id }),
      });
      const text = await r.text();
      let body: any = text;
      try { body = JSON.parse(text); } catch { /* keep text */ }
      results.push({ username, status: r.status, body });
    }
    return new Response(JSON.stringify({ results }), { headers: jh });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: jh });
  }
});
