// Efí Pix — reconciliação automática.
// Roda por cron (a cada minuto). Consulta na Efí todas as cobranças `pending`
// das últimas 48h e, quando encontra uma CONCLUIDA, entrega o mesmo payload que
// a Efí enviaria para `efi-webhook`, reaproveitando toda a lógica de renovação.
// Isso garante que o pagamento seja processado mesmo se o revendedor não tiver
// registrado o webhook na conta Efí dele.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCredentials, getChargeStatus } from "../_shared/efi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const since = new Date(Date.now() - 48 * 3600_000).toISOString();

  try {
    const { data: charges, error } = await admin
      .from("efi_charges")
      .select("id, owner_id, txid, amount, status, created_at")
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(80);
    if (error) throw error;

    if (!charges?.length) return json({ ok: true, checked: 0, paid: 0 });

    // Agrupa credenciais por revendedor (evita reler settings por cobrança).
    const ownerIds = [...new Set(charges.map((c) => c.owner_id))];
    const { data: settingsRows } = await admin
      .from("efi_settings")
      .select("*")
      .in("user_id", ownerIds)
      .eq("enabled", true);
    const settingsByOwner = new Map((settingsRows ?? []).map((s: any) => [s.user_id, s]));

    let paid = 0;
    let checked = 0;
    const errors: string[] = [];

    for (const charge of charges) {
      const settings = settingsByOwner.get(charge.owner_id);
      if (!settings) continue;
      checked++;
      try {
        const creds = buildCredentials(settings as any);
        const res = await getChargeStatus(creds, charge.txid);
        const status = String(res.body?.status || "");
        if (status !== "CONCLUIDA") {
          if (status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || status === "REMOVIDA_PELO_PSP") {
            await admin.from("efi_charges").update({ status: "cancelled" }).eq("id", charge.id);
          }
          continue;
        }

        const pix = Array.isArray(res.body?.pix) ? res.body.pix[0] : null;
        const valor = Number(pix?.valor ?? charge.amount);
        const endToEndId = String(pix?.endToEndId || "");

        // Reaproveita a lógica completa do webhook (renovação + notificações).
        const hookRes = await fetch(`${SUPABASE_URL}/functions/v1/efi-webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pix: [{ txid: charge.txid, valor: valor.toFixed(2), endToEndId, horario: new Date().toISOString() }],
          }),
        });
        const hookBody = await hookRes.json().catch(() => ({}));
        if (hookRes.ok) {
          paid++;
          console.log(`[efi-reconcile] cobrança ${charge.txid} conciliada`, hookBody);
        } else {
          errors.push(`${charge.txid}: webhook ${hookRes.status}`);
        }
      } catch (e) {
        errors.push(`${charge.txid}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return json({ ok: true, checked, paid, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[efi-reconcile] erro", msg);
    return json({ error: msg }, 500);
  }
});
