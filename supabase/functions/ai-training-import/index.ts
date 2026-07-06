// Importa histórico do WhatsApp (Evolution) e agrupa em conversas
// para o módulo "Treinamento da IA". Streaming por contato para não estourar memória.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CONV_GAP_MS = 6 * 60 * 60 * 1000; // 6h -> nova conversa
const PAGE_SIZE = 400;
const DEFAULT_LIMIT_MESSAGES = 100000;

function isOut(direction: string) {
  return ["outgoing", "sent", "out", "from_me", "operator"].includes(String(direction || "").toLowerCase());
}
function isIn(direction: string) {
  return ["incoming", "received", "in", "customer"].includes(String(direction || "").toLowerCase());
}
function contactKey(m: any) {
  return String(m.phone || m.remote_jid || "unknown")
    .replace(/@s\.whatsapp\.net|@c\.us|@lid/gi, "")
    .replace(/\D/g, "") || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const from: string | null = body.from ?? null;
    const to: string | null = body.to ?? null;
    const limitMessages: number = Math.min(Number(body.limitMessages ?? DEFAULT_LIMIT_MESSAGES), 200000);

    // Total para barra de progresso
    let totalQ = supabase.from("evolution_messages").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (from) totalQ = totalQ.gte("created_at", from);
    if (to) totalQ = totalQ.lte("created_at", to);
    const { count: totalMessages } = await totalQ;

    const { data: job } = await supabase
      .from("ai_training_jobs")
      .insert({
        user_id: userId,
        kind: "import",
        source: "evolution",
        status: "running",
        total: totalMessages ?? 0,
        processed: 0,
        message: "Iniciando importação em lotes...",
      })
      .select()
      .single();

    // Estado por contato (streaming). Só mantém um contato aberto por vez em memória.
    const openContacts = new Map<string, any[]>();
    let created = 0;
    let skippedOneSided = 0;
    let skippedDuplicate = 0;
    let processed = 0;
    const directionStats: Record<string, number> = {};

    const flush = async (phone: string, current: any[]) => {
      if (current.length < 2) return;
      const hasOperator = current.some(x => isOut(x.direction));
      const hasCustomer = current.some(x => isIn(x.direction));
      if (!hasOperator || !hasCustomer) { skippedOneSided++; return; }
      const first = current[0], last = current[current.length - 1];
      const started = new Date(first.created_at).getTime();
      const ended = new Date(last.created_at).getTime();

      const { data: existing } = await supabase
        .from("ai_training_conversations")
        .select("id")
        .eq("user_id", userId)
        .eq("source", "evolution")
        .eq("contact_phone", phone)
        .eq("started_at", first.created_at)
        .eq("ended_at", last.created_at)
        .maybeSingle();
      if (existing?.id) { skippedDuplicate++; return; }

      const { error: insertError } = await supabase.from("ai_training_conversations").insert({
        user_id: userId,
        source: "evolution",
        contact_phone: phone,
        contact_name: current.find(x => x.contact_name)?.contact_name ?? null,
        started_at: first.created_at,
        ended_at: last.created_at,
        duration_seconds: Math.max(0, Math.round((ended - started) / 1000)),
        message_count: current.length,
        status: "imported",
        raw: current.map(m => ({
          t: m.created_at, d: m.direction,
          c: (m.content ?? "").slice(0, 2000),
          k: m.message_type, id: m.id,
        })),
      });
      if (insertError) throw insertError;
      created++;
    };

    // Pagina ordenado por created_at asc. Mantemos várias conversas abertas
    // (uma por contato) e fechamos assim que gap > 6h detectado.
    let page = 0;
    while (processed < (totalMessages ?? Infinity) && processed < limitMessages) {
      let q = supabase
        .from("evolution_messages")
        .select("id,remote_jid,phone,contact_name,direction,content,message_type,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data: rows, error } = await q;
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const m of rows) {
        processed++;
        if (!m.content || String(m.content).trim().length < 1) continue;
        const key = contactKey(m);
        directionStats[String(m.direction || "unknown")] = (directionStats[String(m.direction || "unknown")] || 0) + 1;
        const buf = openContacts.get(key);
        if (!buf) { openContacts.set(key, [m]); continue; }
        const prev = buf[buf.length - 1];
        const gap = new Date(m.created_at).getTime() - new Date(prev.created_at).getTime();
        if (gap > CONV_GAP_MS) {
          await flush(key, buf);
          openContacts.set(key, [m]);
        } else {
          buf.push(m);
        }
      }

      // Fecha contatos ociosos (sem novas mensagens há muito tempo) para liberar memória
      const cutoff = rows[rows.length - 1] ? new Date(rows[rows.length - 1].created_at).getTime() : 0;
      for (const [key, buf] of openContacts) {
        const last = buf[buf.length - 1];
        if (cutoff - new Date(last.created_at).getTime() > CONV_GAP_MS) {
          await flush(key, buf);
          openContacts.delete(key);
        }
      }

      // Atualiza progresso em tempo real
      await supabase.from("ai_training_jobs").update({
        processed,
        message: `Processadas ${processed}/${totalMessages ?? "?"} mensagens • ${created} conversas criadas`,
      }).eq("id", job!.id);

      if (rows.length < PAGE_SIZE) break;
      page++;
    }

    // Fecha os contatos restantes
    for (const [key, buf] of openContacts) await flush(key, buf);
    openContacts.clear();

    await supabase.from("ai_training_jobs").update({
      status: "done",
      total: totalMessages ?? processed,
      processed,
      finished_at: new Date().toISOString(),
      message: `${created} conversas de ${processed} mensagens • Puladas: ${skippedOneSided} sem ida+volta, ${skippedDuplicate} duplicadas`,
    }).eq("id", job!.id);

    return json({
      ok: true, job_id: job!.id,
      conversations_created: created, messages_read: processed,
      skippedOneSided, skippedDuplicate, directionStats,
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
