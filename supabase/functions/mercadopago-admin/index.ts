// Ações administrativas do Mercado Pago (autenticado pelo revendedor):
//   - test: valida o Access Token e verifica se a conta tem Pix habilitado.
//   - webhook-url: devolve a URL que deve ser cadastrada no painel do Mercado Pago.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { testCredentials } from "../_shared/mercadopago-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || "test");

    if (action === "webhook-url") {
      return json({ ok: true, url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook` });
    }

    if (action === "test") {
      let token = String(body.access_token || "").trim();
      if (!token) {
        const { data } = await admin
          .from("mercadopago_settings").select("access_token").eq("user_id", user.id).maybeSingle();
        token = String(data?.access_token || "");
      }
      const result = await testCredentials({ access_token: token });
      if (result.ok) {
        await admin.from("mercadopago_settings")
          .update({ webhook_configured_at: new Date().toISOString() })
          .eq("user_id", user.id);
      }
      return json(result, result.ok ? 200 : 400);
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    console.error("[mercadopago-admin]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
