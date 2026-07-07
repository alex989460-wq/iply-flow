// Central de Conhecimento IA — extração inteligente
// Pipeline: sanitize -> Pass A (compreensão) -> Pass B (extração tipada) -> agrupamento por embedding
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const EMB_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
// Modelo rápido e econômico para analisar 100% sem travar; fallback só para erro técnico.
const MODEL_PRIMARY = "google/gemini-2.5-flash";
const MODEL_FALLBACK = "openai/gpt-4.1-mini";
const EMB_MODEL = "openai/text-embedding-3-small";

const KINDS = ["procedure","flow","intent","official_answer","business_rule","tutorial"] as const;
const CATEGORIES = [
  "instalacao","configuracao","login","usuario_senha","codigo","ativacao",
  "renovacao","pagamento","pix","financeiro","liberacao","teste","atualizacao",
  "compatibilidade","travamento","tela_preta","buffer","dns","revendedor",
  "planos","cancelamento","suporte","outros",
];

// ---------- SANITIZAÇÃO ----------
const NOISE_PATTERNS = [
  /^(oi+|ol[aá]+|opa|eae|e[aá]e|hey|hi|hello)[\s!.,?]*$/i,
  /^(bom\s?dia|boa\s?tarde|boa\s?noite|boa\s?madrugada)[\s!.,?]*$/i,
  /^(ok+|okay|blz|beleza|show|top|massa|legal|joia|jóia)[\s!.,?]*$/i,
  /^(obrigad[oa]+|valeu|vlw|agradeç[oa]|tks|thanks|grato)[\s!.,?]*$/i,
  /^(tchau|bye|até\s?mais|falou|flw|até\s?logo|abraç?o[s]?)[\s!.,?]*$/i,
  /^(sim|não|nao|s|n|yes|no|uhum|aham|humm+)[\s!.,?]*$/i,
  /^\?+$/, /^\!+$/, /^\.+$/,
  /^comprovante(\s|$)/i, /^segue\s+comprovante/i,
  /^pix\s+(enviado|copiado|realizado|efetuado)/i,
  /^r?\$\s*\d+[\d.,]*\s*(reais)?\s*$/i,
  /^pagamento\s+(realizado|efetuado|enviado)/i,
];

// Reconhece se é só emoji/sticker/link
function isNoise(text: string): boolean {
  const t = String(text || "").trim();
  if (t.length === 0) return true;
  // Só emoji
  const stripped = t.replace(/[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu, "");
  if (stripped.length === 0) return true;
  // Só link
  if (/^https?:\/\/\S+$/.test(t)) return true;
  // Muito curto
  if (t.length < 3) return true;
  return NOISE_PATTERNS.some((r) => r.test(t));
}

function isOut(direction: string) {
  return ["outgoing","sent","out","from_me","operator"].includes(String(direction || "").toLowerCase());
}

function sanitize(raw: any[]): { turns: { role: "CLIENTE"|"OPERADOR"; text: string }[]; hasAudio: boolean; hasImage: boolean; hasFile: boolean } {
  const turns: { role: "CLIENTE"|"OPERADOR"; text: string }[] = [];
  let hasAudio = false, hasImage = false, hasFile = false;
  let lastKey = "";
  for (const m of raw) {
    const kind = String(m.k || "").toLowerCase();
    if (kind.includes("audio")) hasAudio = true;
    if (kind.includes("image")) hasImage = true;
    if (kind.includes("document") || kind.includes("file")) hasFile = true;

    const text = String(m.c || "").trim();
    if (!text || isNoise(text)) continue;
    // Ignora media puro sem legenda útil
    if (kind && kind !== "text" && kind !== "conversation" && text.length < 15) continue;

    const role: "CLIENTE"|"OPERADOR" = isOut(m.d) ? "OPERADOR" : "CLIENTE";
    const key = `${role}:${text.toLowerCase()}`;
    if (key === lastKey) continue; // duplicado consecutivo
    lastKey = key;
    turns.push({ role, text: text.slice(0, 600) });
  }
  return { turns, hasAudio, hasImage, hasFile };
}

// ---------- IA ----------
class AiUnavailableError extends Error {
  code = "ai_unavailable";
}

function extractJSON(raw: string): any {
  let s = String(raw || "").replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/```\s*$/im, "").trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const oi = s.indexOf("{"), ai = s.indexOf("[");
    const isArr = ai !== -1 && (oi === -1 || ai < oi);
    const start = isArr ? ai : oi;
    const end = isArr ? s.lastIndexOf("]") : s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  return JSON.parse(s);
}

async function callAIOnce(apiKey: string, model: string, system: string, user: string): Promise<any> {
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.15,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    const lower = body.toLowerCase();
    if (r.status === 402 || lower.includes("not enough credits") || lower.includes("payment_required")) {
      throw new AiUnavailableError("Créditos de IA insuficientes para continuar a análise. Nada foi apagado; recarregue créditos e clique em Analisar para retomar de onde parou.");
    }
    if (r.status === 429 || lower.includes("rate limit")) {
      throw new AiUnavailableError("A IA atingiu o limite momentâneo de processamento. Aguarde alguns minutos e clique em Analisar para continuar de onde parou.");
    }
    throw new Error(`AI ${r.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  return extractJSON(content);
}

async function callAI(apiKey: string, system: string, user: string): Promise<any> {
  try { return await callAIOnce(apiKey, MODEL_PRIMARY, system, user); }
  catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    console.warn("primary model failed, falling back:", (e as Error).message);
    return await callAIOnce(apiKey, MODEL_FALLBACK, system, user);
  }
}

async function embed(apiKey: string, text: string): Promise<number[]> {
  const r = await fetch(EMB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMB_MODEL, input: text.slice(0, 8000), dimensions: 1536 }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`EMB ${r.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const j = await r.json();
  return j.data?.[0]?.embedding;
}

function computeConfidence(usage: number, rate: number): number {
  const c = 0.4 + 0.3 * Math.log10(usage + 1) + 0.3 * rate;
  return Math.min(1, Math.max(0, +c.toFixed(3)));
}

// ---------- HANDLER ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    // Processa poucos atendimentos por chamada para evitar timeout e travamento.
    // A tela chama novamente até zerar a fila, então 100% é analisado com progresso real.
    const chunk: number = Math.min(3, Math.max(1, Number(body.batch ?? 2)));
    const requestedJobId = typeof body.jobId === "string" ? body.jobId : null;

    const { count: pendingBefore } = await supabase.from("ai_training_conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).is("analyzed_at", null);

    let job: any = null;
    if (requestedJobId) {
      const { data: existingJob } = await supabase.from("ai_training_jobs")
        .select("*").eq("id", requestedJobId).eq("user_id", userId).maybeSingle();
      job = existingJob;
    }

    if (job?.status === "cancelled") return json({ ok: true, cancelled: true, jobId: job.id });

    if (!job || job.status !== "running") {
      const { data: newJob, error: jobError } = await supabase.from("ai_training_jobs")
        .insert({
          user_id: userId, kind: "analyze", status: "running",
          total: pendingBefore ?? 0, processed: 0,
          message: `Fila iniciada: ${pendingBefore ?? 0} conversas pendentes.`,
        })
        .select().single();
      if (jobError) throw jobError;
      job = newJob;
    }

    if (!pendingBefore || pendingBefore === 0) {
      await supabase.from("ai_training_jobs").update({
        status: "done", finished_at: new Date().toISOString(),
        message: "Nenhuma conversa pendente para analisar",
      }).eq("id", job!.id);
      return json({ ok: true, done: true, jobId: job!.id, processed: 0, remaining: 0 });
    }

    const totalForJob = Math.max(Number(job.total || 0), pendingBefore ?? 0);
    let alreadyProcessed = Math.min(
      totalForJob,
      Math.max(Number(job.processed || 0), totalForJob - (pendingBefore ?? 0)),
    );
    let batchProcessed = 0;
    let totalItemsCreated = 0, totalItemsMerged = 0, totalNoSignal = 0, totalErrors = Number(job.errors || 0);

    const { data: convs, error: convError } = await supabase.from("ai_training_conversations")
      .select("id,raw,contact_phone,duration_seconds,message_count")
      .eq("user_id", userId).is("analyzed_at", null)
      .order("created_at", { ascending: true })
      .limit(chunk);
    if (convError) throw convError;

    if (!convs || convs.length === 0) {
      await supabase.from("ai_training_jobs").update({
        status: "done", processed: totalForJob, finished_at: new Date().toISOString(),
        message: "Concluído: todas as conversas pendentes foram analisadas.",
      }).eq("id", job!.id);
      return json({ ok: true, done: true, jobId: job!.id, processed: alreadyProcessed, remaining: 0 });
    }

    for (const c of convs) {
      const { data: jobState } = await supabase.from("ai_training_jobs")
        .select("status").eq("id", job!.id).single();
      if (jobState?.status === "cancelled") {
        await supabase.from("ai_training_jobs").update({
          finished_at: new Date().toISOString(),
          message: `Cancelado após ${alreadyProcessed + batchProcessed} conversas analisadas.`,
        }).eq("id", job!.id);
        return json({ ok: true, cancelled: true, jobId: job!.id, processed: alreadyProcessed + batchProcessed });
      }

      try {
            const { turns } = sanitize((c.raw as any[]) || []);
            const hasClient = turns.some(t => t.role === "CLIENTE");
            const hasOp = turns.some(t => t.role === "OPERADOR");
            if (!hasClient || !hasOp || turns.length < 2) {
              await supabase.from("ai_training_conversations").update({
                analyzed_at: new Date().toISOString(),
                signal_quality: "none",
                analysis_version: 3,
              }).eq("id", c.id);
              totalNoSignal++;
              batchProcessed++;
              await supabase.from("ai_training_jobs").update({
                processed: alreadyProcessed + batchProcessed,
                errors: totalErrors,
                message: `${alreadyProcessed + batchProcessed}/${totalForJob} analisadas • ${totalItemsCreated} novos • ${totalItemsMerged} agrupados • ${totalNoSignal} sem sinal`,
              }).eq("id", job!.id);
              continue;
            }

            const transcript = turns.map(t => `${t.role}: ${t.text}`).join("\n").slice(0, 5000);

            const analysis = await callAI(apiKey,
              `Você é um analista sênior de suporte técnico de IPTV/streaming no Brasil. Extraia conhecimento reutilizável com precisão acima de 90%, sem inventar. Categorias válidas: ${CATEGORIES.join(", ")}. Responda SOMENTE JSON válido.`,
              `Analise este atendimento uma única vez e responda EXATAMENTE neste JSON:
{"problem":"...","solution":"...","resolved":true|false,"category":"...","device":"...|null","app":"...|null","operator":"...|null","signal_quality":"high|medium|none","items":[{"kind":"procedure|flow|intent|official_answer|business_rule|tutorial","subject":"...","problem":"...","solution":"...","steps":["..."],"devices":["..."],"apps":["..."],"category":"...","keywords":["..."]}]}

REGRAS ESTRITAS:
1. signal_quality="none" se não houver problema + solução claros, se for só saudação/comprovante/áudio sem transcrição, ou se a certeza for menor que 90%.
2. problem deve ser específico, citando app, dispositivo, canal, login, código ou sintoma quando existir.
3. solution deve ser uma resposta profissional pronta para reutilizar, como se fosse você respondendo corretamente o próximo cliente.
4. resolved=true somente quando o cliente confirmou que funcionou após a orientação.
5. Extraia no máximo 3 items realmente reutilizáveis; se não houver conhecimento claro, use items: [].
6. Não invente procedimentos, valores, prazos, links, painéis ou nomes de aplicativos que não estejam na conversa.

CONVERSA:
${transcript}`);


            const signal = analysis.signal_quality || "medium";
            await supabase.from("ai_training_conversations").update({
              analyzed_at: new Date().toISOString(),
              problem_summary: (analysis.problem || "").slice(0, 500),
              solution_summary: (analysis.solution || "").slice(0, 500),
              resolved: analysis.resolved === true,
              category: CATEGORIES.includes(analysis.category) ? analysis.category : "outros",
              device: analysis.device || null,
              app: analysis.app || null,
              operator_name: analysis.operator || null,
              signal_quality: signal,
              analysis_version: 3,
            }).eq("id", c.id);

            if (signal === "none") {
              totalNoSignal++;
              batchProcessed++;
              await supabase.from("ai_training_jobs").update({
                processed: alreadyProcessed + batchProcessed,
                errors: totalErrors,
                message: `${alreadyProcessed + batchProcessed}/${totalForJob} analisadas • ${totalItemsCreated} novos • ${totalItemsMerged} agrupados • ${totalNoSignal} sem sinal`,
              }).eq("id", job!.id);
              continue;
            }

            const items: any[] = Array.isArray(analysis.items) ? analysis.items.slice(0, 3) : [];

            for (const it of items) {
              const kind = KINDS.includes(it.kind) ? it.kind : "intent";
              const subject = String(it.subject || "").trim().slice(0, 200);
              const solution = String(it.solution || "").trim().slice(0, 3000);
              if (subject.length < 5 || solution.length < 5) continue;

              const category = CATEGORIES.includes(it.category) ? it.category : (analysis.category || "outros");
              const problem = String(it.problem || analysis.problem || "").slice(0, 1000);
              const steps = Array.isArray(it.steps) ? it.steps.map((s: any) => String(s).slice(0, 300)).slice(0, 20) : [];
              const devices = Array.isArray(it.devices) ? it.devices.map(String).slice(0, 6) : (analysis.device ? [analysis.device] : []);
              const apps = Array.isArray(it.apps) ? it.apps.map(String).slice(0, 6) : (analysis.app ? [analysis.app] : []);
              const keywords = Array.isArray(it.keywords) ? it.keywords.map((s: any) => String(s).toLowerCase()).slice(0, 12) : [];

              const embText = `${subject}\n${problem}\n${solution}`.slice(0, 4000);
              let embedding: number[] | null = null;
              try { embedding = await embed(apiKey, embText); } catch { totalErrors++; continue; }

              const { data: matches } = await supabase.rpc("match_ai_knowledge_items", {
                _user_id: userId,
                _kind: kind,
                _category: category,
                query_embedding: embedding,
                match_threshold: 0.86,
                match_count: 1,
              });

              const operator = analysis.operator || "desconhecido";

              if (matches && matches.length > 0) {
                const m = matches[0];
                const { data: existing } = await supabase.from("ai_knowledge_items")
                  .select("usage_count,resolved_count,operators,source_conversation_ids,steps,devices,apps,keywords")
                  .eq("id", m.id).single();

                const usage = (existing?.usage_count || 0) + 1;
                const resolved = (existing?.resolved_count || 0) + (analysis.resolved ? 1 : 0);
                const rate = usage > 0 ? resolved / usage : 0;
                const ops = Array.isArray(existing?.operators) ? existing!.operators as any[] : [];
                const opIdx = ops.findIndex((o: any) => o.name === operator);
                if (opIdx >= 0) ops[opIdx].count = (ops[opIdx].count || 0) + 1;
                else ops.push({ name: operator, count: 1 });

                const mergedSteps = Array.from(new Set([...(existing?.steps || []), ...steps])).slice(0, 20);
                const mergedDevices = Array.from(new Set([...(existing?.devices || []), ...devices])).slice(0, 8);
                const mergedApps = Array.from(new Set([...(existing?.apps || []), ...apps])).slice(0, 8);
                const mergedKw = Array.from(new Set([...(existing?.keywords || []), ...keywords])).slice(0, 20);
                const sids = Array.from(new Set([...(existing?.source_conversation_ids || []), c.id])).slice(0, 200);

                await supabase.from("ai_knowledge_items").update({
                  usage_count: usage,
                  resolved_count: resolved,
                  success_rate: rate,
                  confidence: computeConfidence(usage, rate),
                  last_used_at: new Date().toISOString(),
                  operators: ops.slice(0, 20),
                  source_conversation_ids: sids,
                  steps: mergedSteps,
                  devices: mergedDevices,
                  apps: mergedApps,
                  keywords: mergedKw,
                }).eq("id", m.id);
                totalItemsMerged++;
              } else {
                await supabase.from("ai_knowledge_items").insert({
                  user_id: userId,
                  kind, subject, problem, solution,
                  steps, devices, apps, keywords, category,
                  usage_count: 1,
                  resolved_count: analysis.resolved ? 1 : 0,
                  success_rate: analysis.resolved ? 1 : 0,
                  confidence: computeConfidence(1, analysis.resolved ? 1 : 0),
                  last_used_at: new Date().toISOString(),
                  operators: [{ name: operator, count: 1 }],
                  source_conversation_ids: [c.id],
                  embedding,
                  status: "pending",
                });
                totalItemsCreated++;
              }
            }
            batchProcessed++;
          } catch (e) {
            if (e instanceof AiUnavailableError) {
              await supabase.from("ai_training_jobs").update({
                status: "failed",
                finished_at: new Date().toISOString(),
                message: e.message,
                errors: totalErrors + 1,
              }).eq("id", job!.id);
              // Retorna 200 com flag paused para que o frontend consiga exibir a mensagem
              // amigável em vez do genérico "Edge Function returned a non-2xx status code".
              return json({ ok: true, paused: true, reason: e.code, message: e.message, jobId: job!.id, processed: alreadyProcessed + batchProcessed });
            }
            totalErrors++;
            batchProcessed++;
            console.error("analyze err", e);
            await supabase.from("ai_training_conversations").update({
              analyzed_at: new Date().toISOString(),
              signal_quality: "none",
              status: "analysis_error",
              analysis_version: 3,
            }).eq("id", c.id);
          }

      await supabase.from("ai_training_jobs").update({
          processed: alreadyProcessed + batchProcessed,
          errors: totalErrors,
          message: `${alreadyProcessed + batchProcessed}/${totalForJob} analisadas • ${totalItemsCreated} novos • ${totalItemsMerged} agrupados • ${totalNoSignal} sem sinal`,
        }).eq("id", job!.id);
    }

      const { count: remaining } = await supabase.from("ai_training_conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).is("analyzed_at", null);

      const done = !remaining || remaining === 0;
      if (done) {
      await supabase.from("ai_training_jobs").update({
        status: "done",
          processed: totalForJob,
        errors: totalErrors,
        finished_at: new Date().toISOString(),
          message: `Concluído: ${totalForJob} analisadas • ${totalItemsCreated} novos neste lote • ${totalItemsMerged} agrupados neste lote • ${totalNoSignal} sem sinal útil`,
      }).eq("id", job!.id);
      }

    return json({
      ok: true,
      done,
      jobId: job!.id,
      total: totalForJob,
      processed: alreadyProcessed + batchProcessed,
      remaining: remaining ?? 0,
      batchProcessed,
      created: totalItemsCreated,
      merged: totalItemsMerged,
      noSignal: totalNoSignal,
      errors: totalErrors,
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});


function json(p: unknown, s = 200) {
  return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
