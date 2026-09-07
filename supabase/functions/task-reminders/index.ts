// task-reminders: verifica tarefas com lembrete vencido e dispara avisos
// (WhatsApp via CRM Oficial / Evolution + push via OneSignal).
// Executada por cron a cada minuto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface TaskRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  priority: string;
  due_at: string | null;
  remind_at: string | null;
  recurrence: string;
  notify_whatsapp: boolean;
  notify_push: boolean;
  notify_phone: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return "sem prazo";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function nextOccurrence(iso: string, recurrence: string): string | null {
  const d = new Date(iso);
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString();
}

async function sendWhatsApp(supabase: ReturnType<typeof createClient>, ownerId: string, phone: string, text: string) {
  const { data: crm } = await supabase
    .from("crm_oficial_settings")
    .select("enabled, api_key")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (crm?.enabled && crm?.api_key) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/crm-oficial-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ action: "sendText", number: phone, text, user_id: ownerId }),
    });
    if (res.ok) return "crm";
  }

  const res2 = await fetch(`${SUPABASE_URL}/functions/v1/evolution-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ phone, message: text, user_id: ownerId }),
  });
  return res2.ok ? "evolution" : "failed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();

  try {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id, owner_id, title, description, priority, due_at, remind_at, recurrence, notify_whatsapp, notify_push, notify_phone")
      .neq("status", "done")
      .not("remind_at", "is", null)
      .lte("remind_at", nowIso)
      .is("last_notified_at", null)
      .limit(50);

    if (error) throw error;

    const results: unknown[] = [];

    for (const t of (tasks ?? []) as TaskRow[]) {
      const prio = t.priority === "urgente" ? "🔴 URGENTE" : t.priority === "alta" ? "🟠 Alta" : t.priority === "baixa" ? "🟢 Baixa" : "🟡 Média";
      const text =
        `⏰ *Lembrete de tarefa*\n\n` +
        `📌 *${t.title}*\n` +
        (t.description ? `📝 ${t.description}\n` : "") +
        `⚡ Prioridade: ${prio}\n` +
        `📅 Prazo: ${fmt(t.due_at)}`;

      let whatsapp = "skipped";
      if (t.notify_whatsapp) {
        let phone = (t.notify_phone || "").replace(/\D/g, "");
        if (!phone) {
          const { data: bs } = await supabase
            .from("billing_settings")
            .select("notification_phone")
            .eq("user_id", t.owner_id)
            .maybeSingle();
          phone = String(bs?.notification_phone || "").replace(/\D/g, "");
        }
        if (phone) {
          if (phone.length <= 11) phone = `55${phone}`;
          whatsapp = await sendWhatsApp(supabase, t.owner_id, phone, text);
        } else {
          whatsapp = "no_phone";
        }
      }

      if (t.notify_push) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            owner_id: t.owner_id,
            title: "⏰ Lembrete de tarefa",
            body: t.title,
            data: { type: "task", task_id: t.id },
          }),
        }).catch(() => null);
      }

      const update: Record<string, unknown> = { last_notified_at: nowIso };
      if (t.recurrence && t.recurrence !== "none" && t.remind_at) {
        update.remind_at = nextOccurrence(t.remind_at, t.recurrence);
        if (t.due_at) update.due_at = nextOccurrence(t.due_at, t.recurrence);
        update.last_notified_at = null;
      }
      await supabase.from("tasks").update(update).eq("id", t.id);

      results.push({ id: t.id, whatsapp });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[task-reminders]", err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
