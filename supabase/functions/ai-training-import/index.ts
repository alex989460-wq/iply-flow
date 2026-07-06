// Importa histórico do WhatsApp (Evolution) e agrupa em conversas
// para o módulo "Treinamento da IA".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CONV_GAP_MS = 6 * 60 * 60 * 1000; // 6h -> nova conversa

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

    // Cria job
    const { data: job } = await supabase
      .from("ai_training_jobs")
      .insert({ user_id: userId, kind: "import", source, status: "running" })
      .select()
      .single();

    // Lê mensagens em páginas
    let page = 0;
    const pageSize = 1000;
    const byContact = new Map<string, any[]>();
    let total = 0;

    while (true) {
      let q = supabase
        .from("evolution_messages")
        .select("id,user_id,phone,contact_name,direction,content,message_type,created_at,instance_name")
        .eq("user_id", userId)
        .order("phone", { ascending: true })
        .order("created_at", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data: rows, error } = await q;
      if (error) throw error;
      if (!rows || rows.length === 0) break;
      for (const m of rows) {
        const key = m.phone || "unknown";
        if (!byContact.has(key)) byContact.set(key, []);
        byContact.get(key)!.push(m);
      }
      total += rows.length;
      if (rows.length < pageSize) break;
      page++;
    }

    // Agrupa em conversas por gap de 6h
    let created = 0;
    for (const [phone, msgs] of byContact.entries()) {
      let current: any[] = [];
      const flush = async () => {
        if (current.length < 2) { current = []; return; }
        const isOut = (d: string) => d === "outgoing" || d === "sent" || d === "out";
        const isIn = (d: string) => d === "incoming" || d === "received" || d === "in";
        const hasOperator = current.some(x => isOut(x.direction));
        const hasCustomer = current.some(x => isIn(x.direction));
        if (!hasOperator || !hasCustomer) { current = []; return; }
        const first = current[0], last = current[current.length - 1];
        const started = new Date(first.created_at).getTime();
        const ended = new Date(last.created_at).getTime();
        await supabase.from("ai_training_conversations").insert({
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
          })),
        });
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
      message: `${created} conversas importadas de ${total} mensagens`,
    }).eq("id", job!.id);

    return json({ ok: true, conversations_created: created, messages_read: total });
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
