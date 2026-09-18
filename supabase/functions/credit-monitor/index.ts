// Vistoria horária dos créditos dos painéis.
// Para cada revenda com alerta ligado, consulta os créditos reais (panel-stats)
// e avisa no WhatsApp quando algum painel estiver abaixo do mínimo definido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Não repetir o mesmo aviso antes desse intervalo (horas).
const ALERT_COOLDOWN_HOURS = 6;

function toWaPhone(raw: unknown) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({} as any));
    const onlyUser: string | null = body?.user_id ? String(body.user_id) : null;
    const force = !!body?.force;

    let q = admin
      .from("reseller_api_settings")
      .select("user_id, credit_alert_enabled, credit_alert_threshold, credit_alert_phone, credit_alert_last_sent_at")
      .eq("credit_alert_enabled", true);
    if (onlyUser) q = q.eq("user_id", onlyUser);
    const { data: configs, error: cfgErr } = await q;
    if (cfgErr) throw cfgErr;

    const report: any[] = [];

    for (const cfg of (configs || []) as any[]) {
      const ownerId = String(cfg.user_id);
      const threshold = Number(cfg.credit_alert_threshold ?? 10);
      const entry: any = { user_id: ownerId, threshold, low: [], sent: false };

      try {
        // Respeita o intervalo entre avisos
        const last = cfg.credit_alert_last_sent_at ? new Date(cfg.credit_alert_last_sent_at).getTime() : 0;
        const withinCooldown = last && Date.now() - last < ALERT_COOLDOWN_HOURS * 3600_000;

        const { data: servers } = await admin
          .from("servers")
          .select("id, server_name")
          .eq("created_by", ownerId);
        const serverNames = new Map<string, string>((servers || []).map((s: any) => [String(s.id), s.server_name]));
        if (!serverNames.size) {
          entry.skipped = "sem servidores";
          report.push(entry);
          continue;
        }

        // Consulta os painéis (atualiza panel_stats_cache também)
        const statsResp = await fetch(`${SUPABASE_URL}/functions/v1/panel-stats`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ action: "stats", owner_id: ownerId, server_ids: [...serverNames.keys()] }),
        });
        const statsBody = await statsResp.json().catch(() => ({}));
        const stats = (statsBody?.stats || {}) as Record<string, { credits: number | null; error?: string }>;

        const low = Object.entries(stats)
          .filter(([, s]) => typeof s?.credits === "number" && (s.credits as number) <= threshold)
          .map(([serverId, s]) => ({
            server: serverNames.get(serverId) || "Painel",
            credits: s.credits as number,
          }))
          .sort((a, b) => a.credits - b.credits);

        entry.low = low;
        if (!low.length) {
          report.push(entry);
          continue;
        }
        if (withinCooldown && !force) {
          entry.skipped = "aviso recente";
          report.push(entry);
          continue;
        }

        // Para onde enviar
        const { data: billing } = await admin
          .from("billing_settings")
          .select("notification_phone")
          .eq("user_id", ownerId)
          .maybeSingle();
        const phone = toWaPhone(cfg.credit_alert_phone || (billing as any)?.notification_phone);
        const { data: zap } = await admin
          .from("zap_responder_settings")
          .select("selected_department_id")
          .eq("user_id", ownerId)
          .maybeSingle();
        const departmentId = (zap as any)?.selected_department_id;

        if (!phone || !departmentId) {
          entry.skipped = !phone ? "sem telefone configurado" : "sem departamento configurado";
          report.push(entry);
          continue;
        }

        const lines = low.map((l) => `• *${l.server}*: ${l.credits} crédito${l.credits === 1 ? "" : "s"}`).join("\n");
        const text =
          `⚠️ *Créditos baixos nos seus painéis*\n\n${lines}\n\n` +
          `Limite definido: ${threshold} crédito${threshold === 1 ? "" : "s"}.\n` +
          `Faça a recarga para não interromper as renovações.`;

        const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/crm-oficial-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            action: "enviar-mensagem",
            department_id: departmentId,
            number: phone,
            text,
            user_id: ownerId,
          }),
        });
        const sendBody = await sendResp.json().catch(() => ({}));
        const ok = sendResp.ok && (sendBody as any)?.success !== false;
        entry.sent = ok;
        if (!ok) entry.error = (sendBody as any)?.error || `HTTP ${sendResp.status}`;

        if (ok) {
          await admin
            .from("reseller_api_settings")
            .update({ credit_alert_last_sent_at: new Date().toISOString() })
            .eq("user_id", ownerId);
        }
      } catch (err) {
        entry.error = err instanceof Error ? err.message : String(err);
      }

      report.push(entry);
    }

    console.log(`[credit-monitor] revendas verificadas: ${report.length}`);
    return json({ success: true, checked: report.length, report });
  } catch (err) {
    console.error("[credit-monitor] falha:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
