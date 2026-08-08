// Gera blocos/fluxos do construtor (bot_flows) a partir de uma descrição em português.
// Opcionalmente gera imagens para os blocos de imagem e salva em reseller-assets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TEXT_MODEL = "google/gemini-2.5-flash";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

const ALLOWED = [
  "text", "image", "video", "audio", "file", "contact",
  "menu", "transfer", "end", "question", "rating", "tags",
  "condition", "delay", "gpt",
];

const SYSTEM = `Você é um especialista em construir fluxos de atendimento no WhatsApp (chatbot) em português do Brasil.
Receba a descrição do usuário e devolve APENAS um JSON válido no formato:
{"name":"nome curto do fluxo","trigger_keywords":["palavra1","palavra2"],"steps":[
  {"id":"s1","type":"text","title":"Título curto","text":"mensagem completa","buttons":[{"id":"b1","label":"Opção","next_step_id":"s2"}]},
  {"id":"s2","type":"image","title":"Imagem","caption":"legenda","image_prompt":"descrição visual em inglês para gerar a imagem"},
  {"id":"s3","type":"menu","title":"Menu","text":"escolha","menu_style":"buttons","buttons":[{"id":"b2","label":"Sim","next_step_id":"s4"}]}
]}
Regras:
- Tipos permitidos: ${ALLOWED.join(", ")}.
- Sempre em português do Brasil, tom humano e objetivo, use emojis com moderação.
- Textos de tutorial devem ser passo a passo numerado dentro do campo "text".
- Cada botão deve apontar para um id existente em steps (ou null se for fim).
- Máximo 8 steps. Ids simples como s1, s2...
- Nunca escreva nada fora do JSON.`;

async function callGateway(body: unknown, apiKey: string) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
  if (!res.ok) throw new Error(`Falha na IA (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

function parseJson(raw: string) {
  const clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("A IA não retornou um fluxo válido.");
  return JSON.parse(clean.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "IA não configurada no projeto." }), { status: 500, headers: jsonHeaders });

    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt || "").trim();
    const withImages = body?.with_images !== false;
    const context = String(body?.context || "").trim();
    if (!prompt) return new Response(JSON.stringify({ error: "Descreva o que a IA deve criar." }), { status: 400, headers: jsonHeaders });

    const data = await callGateway({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: context ? `${prompt}\n\nContexto do fluxo atual: ${context}` : prompt },
      ],
      temperature: 0.6,
    }, apiKey);

    const raw = data?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJson(String(raw));

    let steps: any[] = Array.isArray(parsed?.steps) ? parsed.steps : [];
    steps = steps.slice(0, 8).map((s: any, i: number) => ({
      ...s,
      id: String(s?.id || `s${i + 1}`),
      type: ALLOWED.includes(s?.type) ? s.type : "text",
    }));

    // Geração de imagens (opcional)
    if (withImages) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      for (const step of steps) {
        if (step.type !== "image" || step.media_url || !step.image_prompt) continue;
        try {
          const img = await callGateway({
            model: IMAGE_MODEL,
            modalities: ["image", "text"],
            messages: [{ role: "user", content: `${step.image_prompt}. Estilo moderno, alta qualidade, sem texto ilegível.` }],
          }, apiKey);
          const url: string | undefined = img?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (!url?.startsWith("data:image")) continue;
          const b64 = url.split(",")[1];
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const path = `${user.id}/flow-ai-${crypto.randomUUID()}.png`;
          const { error: upErr } = await admin.storage.from("reseller-assets")
            .upload(path, bin, { contentType: "image/png", upsert: true });
          if (upErr) continue;
          step.media_url = admin.storage.from("reseller-assets").getPublicUrl(path).data.publicUrl;
        } catch (e) {
          console.error("[ai-flow-builder] imagem falhou:", e);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      name: parsed?.name ?? null,
      trigger_keywords: Array.isArray(parsed?.trigger_keywords) ? parsed.trigger_keywords.slice(0, 20) : [],
      steps,
    }), { headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido ao gerar o fluxo";
    console.error("[ai-flow-builder]", err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
