// Importa histórico do WhatsApp (Evolution) e agrupa em conversas
// para o módulo "Treinamento da IA".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CONV_GAP_MS = 6 * 60 * 60 * 1000; // 6h -> nova conversa
const DEFAULT_LIMIT_MESSAGES = 20000;

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
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const source: string = body.source ?? "evolution";
    const from: string | null = body.from ?? null;
    const to: string | null = body.to ?? null;
    const limitMessages: number = Math.min(Number(body.limitMessages ?? DEFAULT_LIMIT_MESSAGES), 50000);

    // Cria job
    const { data: job } = await supabase
      .from("ai_training_jobs")
      .insert({ user_id: userId, kind: "import", source, status: "running" })
      .select()
      .single();

    // Lê mensagens em páginas. Importação é incremental: ignora conversas já importadas
    // pelo mesmo user/source/contato/início/fim para evitar duplicar toda vez que clicar.
    let page = 0;
    const pageSize = 500;
    const byContact = new Map<string, any[]>();
    let total = 0;
    const directionStats: Record<string, number> = {};

    while (true) {
      let q = supabase
        .from("evolution_messages")
        .select("id,user_id,remote_jid,phone,contact_name,direction,content,message_type,created_at,instance_name,raw")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data: rows, error } = await q;
      if (error) throw error;
      if (!rows || rows.length === 0) break;
      for (const m of rows) {
        if (!m.content || String(m.content).trim().length < 1) continue;
        const key = contactKey(m);
        if (!byContact.has(key)) byContact.set(key, []);
        byContact.get(key)!.push(m);
        directionStats[String(m.direction || "unknown")] = (directionStats[String(m.direction || "unknown")] || 0) + 1;
      }
      total += rows.length;
      if (rows.length < pageSize || total >= limitMessages) break;
      page++;
    }

    // Agrupa em conversas por gap de 6h
    let created = 0;
    let skippedOneSided = 0;
    let skippedDuplicate = 0;
    for (const [phone, msgs] of byContact.entries()) {
      msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let current: any[] = [];
      const flush = async () => {
        if (current.length < 2) { current = []; return; }
        const hasOperator = current.some(x => isOut(x.direction));
        const hasCustomer = current.some(x => isIn(x.direction));
        if (!hasOperator || !hasCustomer) { skippedOneSided++; current = []; return; }
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
        if (existing?.id) { skippedDuplicate++; current = []; return; }

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
            t: m.created_at,
            d: m.direction,
            c: (m.content ?? "").slice(0, 2000),
            k: m.message_type,
            id: m.id,
          })),
        });
        if (insertError) throw insertError;
        created++;
        current = [];
      };
      for (const m of msgs) {
        if (current.length === 0) { current.push(m); continue; }
        const prev = current[current.length - 1];
        const gap = new Date(m.created_at).getTime() - new Date(prev.created_at).getTime();
        if (gap > CONV_GAP_MS) await flush();
        current.push(m);
      }
      await flush();
    }

    await supabase.from("ai_training_jobs").update({
      status: "done",
      total,
      processed: created,
      finished_at: new Date().toISOString(),
      message: `${created} conversas importadas de ${total} mensagens. Puladas: ${skippedOneSided} sem ida+volta, ${skippedDuplicate} duplicadas. Direções: ${JSON.stringify(directionStats)}`,
    }).eq("id", job!.id);

    return json({ ok: true, conversations_created: created, messages_read: total, skippedOneSided, skippedDuplicate, directionStats });
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
