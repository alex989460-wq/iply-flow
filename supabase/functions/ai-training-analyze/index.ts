// Analisa conversas importadas com IA e gera candidatos de conhecimento
// para o módulo "Treinamento da IA". Nada é publicado sem aprovação.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const EMB_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const MODEL = "google/gemini-3.5-flash";
const EMB_MODEL = "openai/text-embedding-3-small";

const CATEGORIES = [
  "instalacao","configuracao","login","ativacao","renovacao",
  "pagamento","pix","teste","suporte","compatibilidade",
  "atualizacao","financeiro","revendedor","outros"
];

function isOut(direction: string) {
  return ["outgoing", "sent", "out", "from_me", "operator"].includes(String(direction || "").toLowerCase());
}

function extractJSON(raw: string): any {
  let cleaned = String(raw || "")
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");
    const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
    const start = isArray ? arrStart : objStart;
    const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const batch: number = Math.min(20, body.batch ?? 10);

    const { data: job } = await supabase
      .from("ai_training_jobs")
      .insert({ user_id: userId, kind: "analyze", status: "running" })
      .select()
      .single();

    const { data: convs } = await supabase
      .from("ai_training_conversations")
      .select("id,raw,contact_phone")
      .eq("user_id", userId)
      .is("analyzed_at", null)
      .limit(batch);

    if (!convs || convs.length === 0) {
      await supabase.from("ai_training_jobs").update({
        status: "done", finished_at: new Date().toISOString(),
        message: "Nenhuma conversa pendente"
      }).eq("id", job!.id);
      return json({ ok: true, processed: 0 });
    }

    let intentsCreated = 0, intentsMerged = 0, errors = 0;

    for (const c of convs) {
      try {
        const transcript = (c.raw as any[])
          .map(m => `${isOut(m.d) ? "OPERADOR" : "CLIENTE"}: ${m.c}`)
          .join("\n").slice(0, 8000);

        const aiResp = await fetch(AI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: `Você analisa conversas de suporte de um serviço de IPTV/streaming. Extraia intenções (pergunta do cliente + resposta do operador). Categorias permitidas: ${CATEGORIES.join(", ")}. Responda SOMENTE JSON válido.` },
              { role: "user", content: `Conversa:\n${transcript}\n\nRetorne JSON no formato: {"intents":[{"customer_question":"...","operator_answer":"...","category":"...","subject":"...","resolved":true|false}]}. Ignore saudações e mensagens vazias. Máximo 5 intents.` },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!aiResp.ok) { errors++; continue; }
        const aiJson = await aiResp.json();
        const finishReason = aiJson.choices?.[0]?.finish_reason || aiJson.stop_reason;
        if (finishReason === "length" || finishReason === "max_tokens") { errors++; continue; }
        const content = aiJson.choices?.[0]?.message?.content ?? "{}";
        let parsed: any = {};
        try { parsed = extractJSON(content); } catch { errors++; continue; }
        const intents: any[] = parsed.intents ?? [];

        for (const it of intents) {
          const q = String(it.customer_question ?? "").trim();
          const a = String(it.operator_answer ?? "").trim();
          if (q.length < 5 || a.length < 5) continue;

          // embedding
          const embResp = await fetch(EMB_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, "Lovable-API-Key": apiKey },
            body: JSON.stringify({ model: EMB_MODEL, input: q, dimensions: 1536 }),
          });
          if (!embResp.ok) { errors++; continue; }
          const embJson = await embResp.json();
          const embedding = embJson.data?.[0]?.embedding;
          if (!embedding) { errors++; continue; }

          // busca similar
          const { data: matches } = await supabase.rpc("match_ai_knowledge_candidates", {
            _user_id: userId,
            query_embedding: embedding,
            match_threshold: 0.86,
            match_count: 1,
          });

          if (matches && matches.length > 0) {
            const m = matches[0];
            const { data: cand } = await supabase
              .from("ai_knowledge_candidates")
              .select("similar_questions,source_conversation_ids,usage_count,success_count")
              .eq("id", m.id).single();
            const sq = new Set([...(cand?.similar_questions ?? []), q]);
            const sids = new Set([...(cand?.source_conversation_ids ?? []), c.id]);
            const usage = (cand?.usage_count ?? 0) + 1;
            const success = (cand?.success_count ?? 0) + (it.resolved ? 1 : 0);
            await supabase.from("ai_knowledge_candidates").update({
              similar_questions: Array.from(sq).slice(0, 30),
              source_conversation_ids: Array.from(sids).slice(0, 100),
              usage_count: usage,
              success_count: success,
              success_rate: usage > 0 ? success / usage : 0,
              last_used_at: new Date().toISOString(),
            }).eq("id", m.id);
            intentsMerged++;
          } else {
            const cat = CATEGORIES.includes(it.category) ? it.category : "outros";
            await supabase.from("ai_knowledge_candidates").insert({
              user_id: userId,
              canonical_question: q.slice(0, 300),
              similar_questions: [q].slice(0, 30),
              best_answer: a.slice(0, 2000),
              category: cat,
              keywords: extractKeywords(q),
              confidence: 0.7,
              usage_count: 1,
              success_count: it.resolved ? 1 : 0,
              success_rate: it.resolved ? 1 : 0,
              last_used_at: new Date().toISOString(),
              source_conversation_ids: [c.id],
              embedding,
            });
            intentsCreated++;
          }
        }

        await supabase.from("ai_training_conversations")
          .update({ analyzed_at: new Date().toISOString() })
          .eq("id", c.id);
      } catch (e) {
        errors++;
        console.error("conv analyze err", e);
      }
    }

    await supabase.from("ai_training_jobs").update({
      status: "done",
      total: convs.length,
      processed: convs.length - errors,
      errors,
      finished_at: new Date().toISOString(),
      message: `${intentsCreated} novos candidatos, ${intentsMerged} agrupados`,
    }).eq("id", job!.id);

    return json({ ok: true, processed: convs.length, intentsCreated, intentsMerged, errors });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});

function extractKeywords(text: string): string[] {
  const stop = new Set(["o","a","os","as","de","da","do","um","uma","que","e","é","para","por","com","não","meu","minha","eu","tem","ter","como","qual","onde","quando","isso","essa","esse","se","na","no","em","pra"]);
  return Array.from(new Set(
    text.toLowerCase().replace(/[^a-záéíóúãõâêôç0-9\s]/g, " ")
      .split(/\s+/).filter(w => w.length > 3 && !stop.has(w))
  )).slice(0, 8);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
