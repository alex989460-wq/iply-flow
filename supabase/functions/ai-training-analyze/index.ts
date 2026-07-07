// Central de Conhecimento IA — extração 100% LOCAL, sem chamadas de IA externa.
// Não consome créditos: usa heurísticas determinísticas + agrupamento por
// similaridade de texto (Jaccard) sobre subject/problem/solution já salvos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const KINDS = ["procedure","flow","intent","official_answer","business_rule","tutorial"] as const;
type Kind = typeof KINDS[number];
const ANALYSIS_VERSION = 5;

// -------- categorização por palavras-chave (pt-BR IPTV/streaming) --------
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  venda: ["adquirir", "comprar", "contratar", "assinar", "quero o sistema", "gostaria de adquirir", "teste", "valor", "plano"],
  indicacao: ["indicação", "indicacao", "indicou", "indicado", "veio por indicação"],
  instalacao: ["instala", "instalar", "instalação", "baixar", "download", "apk"],
  configuracao: ["configura", "configurar", "configuração", "ajustar", "setar"],
  login: ["login", "entrar", "acessar", "logar", "logado", "logou"],
  usuario_senha: ["usuário", "usuario", "senha", "user", "password", "credenciais"],
  codigo: ["código", "codigo", "code", "ativação código", "6 dígitos"],
  ativacao: ["ativar", "ativação", "ativou", "ativado"],
  renovacao: ["renov", "renova", "renovar", "prorrogar", "prorrogação"],
  pagamento: ["pagamento", "pagar", "boleto", "cartão", "cartao"],
  pix: ["pix", "chave pix", "qr code"],
  financeiro: ["fatura", "cobrança", "cobranca", "valor", "preço", "preco"],
  liberacao: ["liberar", "liberação", "liberou", "libera"],
  teste: ["teste", "testar", "trial"],
  atualizacao: ["atualiza", "atualizar", "atualização", "update", "versão", "versao"],
  compatibilidade: ["compatível", "compativel", "compatibilidade", "funciona no"],
  travamento: ["trava", "travando", "travou", "congela"],
  tela_preta: ["tela preta", "tela escura", "sem imagem"],
  buffer: ["buffer", "carregando", "travando imagem", "bufferiza"],
  dns: ["dns", "servidor dns", "endereço dns"],
  revendedor: ["revenda", "revendedor", "credito", "crédito"],
  planos: ["plano", "planos", "pacote", "combo"],
  cancelamento: ["cancelar", "cancelamento", "cancela"],
  suporte: ["suporte", "ajuda", "atendimento"],
};
const CATEGORIES = Object.keys(CATEGORY_KEYWORDS).concat(["outros"]);

// -------- devices / apps conhecidos --------
const DEVICES = ["tv lg","tv samsung","tv box","smart tv","celular","android tv","android","iphone","ios","fire stick","fire tv","chromecast","roku","pc","notebook","xbox","playstation"];
const APPS = ["strimo","ibo player","ibo","smarters","iptv smarters","xtream","perfect player","tivimate","gse","gse smart iptv","duplex play","duplecast","xciptv","stbemu","flix","flixnet","cinevision","warezcd","cortex","cinema hd"];
const TV_BRANDS = ["lg", "samsung", "philco", "tcl", "sony", "aoc", "philips", "roku", "android tv"];
const SALES_HINTS = ["adquirir", "comprar", "contratar", "assinar", "quero o sistema", "gostaria de adquirir", "valor do sistema", "teste grátis", "teste gratis"];

// -------- verbos de instrução (indicam solução) --------
const INSTRUCTION_HINTS = [
  /\b(clica|clique|clicar|toque|toca|aperta|aperte|selecione|seleciona)\b/i,
  /\b(abra|abre|abrir|acesse|acessa|entra|entre|entrar)\b/i,
  /\b(instala|instale|instalar|baixa|baixe|baixar|desinstala|desinstale)\b/i,
  /\b(reinicia|reinicie|reiniciar|reboot|desliga|desligue|liga|ligue)\b/i,
  /\b(atualiza|atualize|atualizar|update)\b/i,
  /\b(configura|configure|configurar|ajusta|ajuste)\b/i,
  /\b(insere|insira|insira o|digite|digita|coloca|coloque)\b/i,
  /\b(usuário|usuario|senha|url|link|código|codigo|pin)\b/i,
  /\bpasso\s*\d+/i, /^\d+[\)\.\-]\s+/m,
];

// -------- confirmações de resolução --------
const RESOLUTION_HINTS = [
  /\bfuncionou\b/i, /\bdeu certo\b/i, /\bresolveu\b/i, /\bresolvido\b/i,
  /\bconseguiu?\b/i, /\bconseg[iu]?\b/i, /\bok+\b/i, /\bperfeito\b/i,
  /\bmuito obrigad[oa]\b/i, /\bvaleu\b/i,
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

function isNoise(text: string): boolean {
  const t = String(text || "").trim();
  if (t.length === 0) return true;
  const stripped = t.replace(/[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu, "");
  if (stripped.length === 0) return true;
  if (/^https?:\/\/\S+$/.test(t)) return true;
  if (t.length < 3) return true;
  return NOISE_PATTERNS.some((r) => r.test(t));
}

function isOut(direction: string) {
  return ["outgoing","sent","out","from_me","operator"].includes(String(direction || "").toLowerCase());
}

type Turn = { role: "CLIENTE"|"OPERADOR"; text: string };

function sanitize(raw: any[]): Turn[] {
  const turns: Turn[] = [];
  let lastKey = "";
  for (const m of raw || []) {
    const kind = String(m.k || "").toLowerCase();
    const text = String(m.c || "").trim();
    if (!text || isNoise(text)) continue;
    if (kind && kind !== "text" && kind !== "conversation" && text.length < 15) continue;
    const role: "CLIENTE"|"OPERADOR" = isOut(m.d) ? "OPERADOR" : "CLIENTE";
    const key = `${role}:${text.toLowerCase()}`;
    if (key === lastKey) continue;
    lastKey = key;
    turns.push({ role, text: text.slice(0, 800) });
  }
  return turns;
}

// ---------- NORMALIZAÇÃO / SIMILARIDADE ----------
function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set("a o os as um uma de do da dos das em para por com sem que se e ou meu minha seu sua no na nos nas ao aos pela pelo pelos pelas eu voce vc voces vcs isso isto esse essa aquele aquela ta esta esta aqui la ali sim nao ne bem mais menos ja tambem so muito pouco".split(" "));

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

// ---------- ANÁLISE LOCAL ----------
function detectCategory(text: string): string {
  const n = normalize(text);
  let best = "outros", bestScore = 0;
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of kws) if (n.includes(normalize(kw))) score++;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

function detectFrom(text: string, list: string[]): string | null {
  const n = normalize(text);
  for (const item of list) if (n.includes(normalize(item))) return item;
  return null;
}

function detectTvBrand(text: string): string | null {
  const n = normalize(text);
  for (const brand of TV_BRANDS) {
    if (new RegExp(`(^|\\s)${normalize(brand).replace(/\\s+/g, "\\s+")}(\\s|$)`).test(n)) return brand;
  }
  return null;
}

function hasAny(text: string, hints: string[]): boolean {
  const n = normalize(text);
  return hints.some((h) => n.includes(normalize(h)));
}

function classifyStage(text: string): string | null {
  const n = normalize(text);
  if (hasAny(n, SALES_HINTS)) return "interesse_compra";
  if (hasAny(n, CATEGORY_KEYWORDS.indicacao)) return "indicacao";
  if (detectTvBrand(n)) return "marca_tv";
  if (hasAny(n, ["pronto", "instalei", "baixei", "ja instalei", "já instalei", "abri o app"])) return "app_instalado";
  if (hasAny(n, ["codigo", "código", "chave", "acesso", "usuario", "senha", "login"])) return "dados_acesso";
  return null;
}

function normalizeProfessionalAnswer(text: string, context: { category: string; app?: string | null; device?: string | null; brand?: string | null }) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const app = context.app || (context.brand === "lg" ? "Strimo" : "aplicativo indicado");
  const brand = context.brand || context.device || "sua TV";

  if (context.category === "venda" || hasAny(clean, SALES_HINTS)) {
    return "Olá! Seja bem-vindo(a). 😊\n\nSe você veio por indicação, por favor anexe ou informe o contato da pessoa que te indicou. Em seguida, me informe a marca da sua TV para eu te passar o procedimento correto de instalação.";
  }

  if (context.category === "indicacao") {
    return "Perfeito, obrigado pela indicação. Agora me informe a marca da sua TV para eu te orientar com o aplicativo correto.";
  }

  if (context.category === "instalacao" || context.brand) {
    if (context.brand === "lg") {
      return "Perfeito, sua TV é LG. Siga este procedimento:\n\n1. Abra a Loja de Apps da TV LG.\n2. Pesquise por Strimo.\n3. Instale e abra o aplicativo.\n4. Assim que abrir, me envie a foto/código que aparece na tela para eu liberar o acesso.";
    }
    return `Perfeito, entendi que é ${brand}. Siga o procedimento de instalação do ${app} para esse aparelho e, ao abrir o app, me envie a foto ou código que aparecer na tela para eu liberar o acesso.`;
  }

  if (context.category === "ativacao" || hasAny(clean, ["pronto", "instalei", "codigo", "chave"])) {
    return "Perfeito. Vou gerar sua chave de acesso e te enviar os dados para entrar no aplicativo. Assim que receber, abra o app, informe os dados e me avise se entrou tudo certo.";
  }

  return clean.slice(0, 1500);
}

function buildFlowNodes(turns: Turn[], context: { brand?: string | null; app?: string | null }) {
  const brand = context.brand || "lg";
  const app = context.app || (brand === "lg" ? "Strimo" : "aplicativo recomendado");
  const hasSale = turns.some((t) => t.role === "CLIENTE" && classifyStage(t.text) === "interesse_compra");
  const hasBrand = turns.some((t) => t.role === "CLIENTE" && (classifyStage(t.text) === "marca_tv" || detectTvBrand(t.text)));
  const hasInstalled = turns.some((t) => t.role === "CLIENTE" && classifyStage(t.text) === "app_instalado");
  if (!hasSale || !hasBrand || !context.brand) return null;

  const start = "inicio_venda";
  const askBrand = "perguntar_marca_tv";
  const conditionBrand = "detectar_marca_tv";
  const installLg = "instalar_strimo_lg";
  const waitInstalled = "aguardar_instalacao";
  const sendAccess = "enviar_dados_acesso";
  const transfer = "transferir_suporte";

  return [
    {
      id: start,
      type: "text",
      title: "Boas-vindas e indicação",
      text: "Olá! Seja bem-vindo(a). 😊\n\nSe você veio por indicação, por favor anexe ou informe o contato da pessoa que te indicou.",
      buttons: [{ id: "next", label: "Próximo", next_step_id: askBrand }],
      position: { x: 120, y: 120 },
    },
    {
      id: askBrand,
      type: "question",
      title: "Perguntar marca da TV",
      text: "Agora me informe a marca da sua TV para eu te passar a instalação correta.",
      variable: "marca_tv",
      buttons: [{ id: "next", label: "Próximo", next_step_id: conditionBrand }],
      position: { x: 460, y: 120 },
    },
    {
      id: conditionBrand,
      type: "condition",
      title: "Detectar marca da TV",
      condition_variable: "marca_tv",
      condition_rules: [
        { id: "lg", op: "contains", value: "lg", next_step_id: installLg },
      ],
      buttons: [{ id: "default", label: "Senão", next_step_id: transfer }],
      position: { x: 800, y: 120 },
    },
    {
      id: installLg,
      type: "question",
      title: `Instalação ${app} na LG`,
      text: `Perfeito, sua TV é LG. Faça assim:\n\n1. Abra a Loja de Apps da TV LG.\n2. Pesquise por ${app}.\n3. Instale e abra o aplicativo.\n4. Quando aparecer o código ou tela inicial, me envie uma foto aqui.`,
      variable: "confirmacao_instalacao",
      buttons: [{ id: "next", label: "Próximo", next_step_id: waitInstalled }],
      position: { x: 1140, y: 80 },
    },
    {
      id: waitInstalled,
      type: "condition",
      title: "Confirmou instalação",
      condition_variable: "confirmacao_instalacao",
      condition_rules: [
        { id: "pronto", op: "regex", value: "(pronto|instalei|baixei|abri|codigo|código|foto)", next_step_id: sendAccess },
      ],
      buttons: [{ id: "default", label: "Senão", next_step_id: installLg }],
      position: { x: 1480, y: 80 },
    },
    {
      id: sendAccess,
      type: "api_call",
      title: "Gerar e enviar chave de acesso",
      api_url: "internal:generate-access-code",
      variable: "chave_acesso",
      text: "Perfeito. Sua chave de acesso é: {{chave_acesso}}\n\nUse essa chave para entrar no aplicativo e me avise se abriu tudo certo. ✅",
      buttons: [],
      position: { x: 1820, y: 80 },
    },
    {
      id: transfer,
      type: "transfer",
      title: "Marca não reconhecida",
      text: "Vou te direcionar para um atendente confirmar o melhor aplicativo para essa TV.",
      transfer_department: "suporte",
      buttons: [],
      position: { x: 1140, y: 300 },
    },
  ].map((step) => ({ ...step, inferred_from_history: true, strong_signal: hasInstalled }));
}

function isInstruction(text: string): boolean {
  return INSTRUCTION_HINTS.some((r) => r.test(text));
}

function analyzeLocal(turns: Turn[]) {
  const clients = turns.filter((t) => t.role === "CLIENTE");
  const ops = turns.filter((t) => t.role === "OPERADOR");
  if (clients.length === 0 || ops.length === 0) {
    return { signal_quality: "none" as const };
  }

  const full = turns.map((t) => t.text).join(" ");
  const category = detectCategory(full);
  const brand = detectTvBrand(full);
  const device = brand ? `tv ${brand}` : detectFrom(full, DEVICES);
  const app = detectFrom(full, APPS) || (brand === "lg" ? "strimo" : null);
  const stages = new Set(turns.map((t) => classifyStage(t.text)).filter(Boolean) as string[]);
  const stageScore = Math.min(1, stages.size / 4);

  // problem = melhor mensagem do CLIENTE após analisar o atendimento inteiro, não apenas o início.
  const rankedClients = clients.slice().sort((a, b) => {
    const sa = (classifyStage(a.text) ? 2 : 0) + Math.min(a.text.length / 120, 1);
    const sb = (classifyStage(b.text) ? 2 : 0) + Math.min(b.text.length / 120, 1);
    return sb - sa;
  });
  const problem = (rankedClients[0]?.text || clients[0].text).slice(0, 500);

  // solução = cruza todas as mensagens do operador e prioriza respostas instrutivas/contextuais.
  const instrOps = ops.filter((t) => isInstruction(t.text) || classifyStage(t.text));
  const chosenOps = (instrOps.length ? instrOps : ops.slice().sort((a, b) => b.text.length - a.text.length)).slice(0, 8);
  const rawSolution = chosenOps.map((t) => t.text).join(" \n").slice(0, 1800);
  const solution = normalizeProfessionalAnswer(rawSolution, { category, app, device, brand }).slice(0, 1800);

  // steps: enumera linhas com "1)" "2)" ou verbos-início
  const steps: string[] = [];
  for (const t of chosenOps) {
    for (const line of t.text.split(/\n|(?<=\.)\s+/)) {
      const l = line.trim();
      if (!l) continue;
      if (/^(\d+[\)\.\-]|passo\s*\d+)/i.test(l) || isInstruction(l)) {
        if (l.length > 6 && l.length < 240) steps.push(l);
      }
    }
  }

  // resolvido: CLIENTE confirmou APÓS a última instrução do OPERADOR
  const lastOpIdx = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === "OPERADOR" && isInstruction(x.t.text)).pop()?.i ?? -1;
  const resolved = lastOpIdx >= 0 && turns.slice(lastOpIdx + 1).some((t) => t.role === "CLIENTE" && RESOLUTION_HINTS.some((r) => r.test(t.text)));

  // qualidade do sinal: precisa ter problema + solução com verbo de instrução
  let signal: "high" | "medium" | "none" = "none";
  if (problem.length >= 20 && solution.length >= 20 && (instrOps.length >= 1 || stageScore >= 0.5)) signal = "high";
  else if (problem.length >= 15 && solution.length >= 15 && stageScore >= 0.25) signal = "medium";

  // subject curto derivado do problema
  const subject = problem.replace(/\s+/g, " ").slice(0, 140);

  // kind: fluxos com múltiplas etapas viram automação; procedimentos ficam separados.
  let kind: Kind = "official_answer";
  const flowNodes = buildFlowNodes(turns, { brand, app });
  if (flowNodes) kind = "flow";
  else if (steps.length >= 2) kind = "procedure";
  else if (/\?/.test(problem)) kind = "intent";

  const keywords = Array.from(new Set(
    normalize(subject + " " + solution).split(" ")
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  )).slice(0, 12);

  const flowKeywords = flowNodes ? ["ola", "olá", "adquirir", "comprar", "contratar", "sistema", "tv", brand || "lg", app || "strimo"].filter(Boolean) : [];

  return {
    signal_quality: signal,
    problem, solution, resolved, category: flowNodes ? "venda" : category,
    device, app,
    items: signal !== "none" ? [{
      kind,
      subject: flowNodes ? "Fluxo profissional de venda e instalação por marca da TV" : subject,
      problem,
      solution: flowNodes
        ? "Fluxo aprovado para conduzir venda: saudação, indicação, identificação da marca da TV, procedimento de instalação do app correto e envio dos dados/chave de acesso."
        : solution,
      steps: flowNodes
        ? [
            "Cumprimentar e solicitar contato de indicação, se houver.",
            "Perguntar a marca da TV.",
            "Detectar automaticamente a marca da TV pela resposta do cliente.",
            "Enviar procedimento correto de instalação do aplicativo.",
            "Aguardar confirmação de instalação ou foto/código do app.",
            "Enviar dados/chave de acesso ou transferir para suporte quando faltar informação.",
          ]
        : steps.slice(0, 12),
      devices: device ? [device] : [],
      apps: app ? [app] : [],
      category: flowNodes ? "venda" : category,
      keywords: Array.from(new Set([...(flowKeywords as string[]), ...keywords])).slice(0, 20),
      flow_nodes: flowNodes || [],
    }] : [],
  };
}

function computeConfidence(usage: number, rate: number): number {
  // Base mais conservadora/profissional: só vira sugestão quando há sinal útil;
  // a confiança sobe principalmente por repetição do mesmo padrão e resolução.
  const c = 0.58 + 0.24 * Math.min(1, Math.log10(usage + 1) / 1.2) + 0.18 * rate;
  return Math.min(1, Math.max(0, +c.toFixed(3)));
}

function json(p: unknown, s = 200) {
  return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ---------- HANDLER ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    // Sem IA externa: pode processar em lotes grandes rapidamente.
    const chunk: number = Math.min(50, Math.max(1, Number(body.batch ?? 25)));
    const requestedJobId = typeof body.jobId === "string" ? body.jobId : null;

    const pendingFilter = `analyzed_at.is.null,analysis_version.lt.${ANALYSIS_VERSION}`;
    const { count: pendingBefore } = await supabase.from("ai_training_conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).or(pendingFilter);

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
        }).select().single();
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
    const alreadyProcessed = Math.min(totalForJob, Math.max(Number(job.processed || 0), totalForJob - (pendingBefore ?? 0)));
    let batchProcessed = 0;
    let totalItemsCreated = 0, totalItemsMerged = 0, totalNoSignal = 0, totalErrors = Number(job.errors || 0);

    const { data: convs, error: convError } = await supabase.from("ai_training_conversations")
      .select("id,raw,contact_phone")
      .eq("user_id", userId).or(pendingFilter)
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

    // Cache leve de itens existentes por (kind|category) para dedup por Jaccard.
    const existingCache = new Map<string, Array<{ id: string; tokenSet: Set<string>; subject: string }>>();
    async function loadExisting(kind: string, category: string) {
      const key = `${kind}|${category}`;
      if (existingCache.has(key)) return existingCache.get(key)!;
      const { data } = await supabase.from("ai_knowledge_items")
        .select("id,subject,problem")
        .eq("user_id", userId).eq("kind", kind).eq("category", category)
        .limit(400);
      const list = (data || []).map((r: any) => ({
        id: r.id, subject: r.subject,
        tokenSet: tokens(`${r.subject} ${r.problem || ""}`),
      }));
      existingCache.set(key, list);
      return list;
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
        const turns = sanitize((c.raw as any[]) || []);
        const analysis = analyzeLocal(turns);
        const signal = analysis.signal_quality;

        await supabase.from("ai_training_conversations").update({
          analyzed_at: new Date().toISOString(),
          problem_summary: (analysis.problem || "").slice(0, 500),
          solution_summary: (analysis.solution || "").slice(0, 500),
          resolved: analysis.resolved === true,
          category: CATEGORIES.includes(analysis.category || "") ? analysis.category : "outros",
          device: analysis.device || null,
          app: analysis.app || null,
          signal_quality: signal,
          analysis_version: ANALYSIS_VERSION,
        }).eq("id", c.id);

        if (signal === "none") {
          totalNoSignal++;
          batchProcessed++;
          continue;
        }

        for (const it of (analysis.items || [])) {
          const kind = KINDS.includes(it.kind as Kind) ? it.kind : "intent";
          const subject = String(it.subject || "").trim().slice(0, 200);
          const solution = String(it.solution || "").trim().slice(0, 3000);
          if (subject.length < 5 || solution.length < 5) continue;
          const category = CATEGORIES.includes(it.category) ? it.category : "outros";

          const existing = await loadExisting(kind, category);
          const newTokens = tokens(`${subject} ${it.problem || ""}`);
          let bestId: string | null = null; let bestScore = 0;
          for (const e of existing) {
            const s = jaccard(newTokens, e.tokenSet);
            if (s > bestScore) { bestScore = s; bestId = e.id; }
          }

          if (bestId && bestScore >= 0.55) {
            const { data: cur } = await supabase.from("ai_knowledge_items")
              .select("usage_count,resolved_count,operators,source_conversation_ids,steps,flow_nodes,devices,apps,keywords")
              .eq("id", bestId).single();
            const usage = (cur?.usage_count || 0) + 1;
            const resolved = (cur?.resolved_count || 0) + (analysis.resolved ? 1 : 0);
            const rate = usage > 0 ? resolved / usage : 0;
            const mergedSteps = Array.from(new Set([...(cur?.steps || []), ...(it.steps || [])])).slice(0, 20);
            const mergedFlowNodes = (Array.isArray(cur?.flow_nodes) && cur.flow_nodes.length) ? cur.flow_nodes : ((it as any).flow_nodes || []);
            const mergedDevices = Array.from(new Set([...(cur?.devices || []), ...(it.devices || [])])).slice(0, 8);
            const mergedApps = Array.from(new Set([...(cur?.apps || []), ...(it.apps || [])])).slice(0, 8);
            const mergedKw = Array.from(new Set([...(cur?.keywords || []), ...(it.keywords || [])])).slice(0, 20);
            const sids = Array.from(new Set([...(cur?.source_conversation_ids || []), c.id])).slice(0, 200);
            await supabase.from("ai_knowledge_items").update({
              usage_count: usage, resolved_count: resolved, success_rate: rate,
              confidence: computeConfidence(usage, rate),
              last_used_at: new Date().toISOString(),
              source_conversation_ids: sids,
              steps: mergedSteps, flow_nodes: mergedFlowNodes, devices: mergedDevices, apps: mergedApps, keywords: mergedKw,
            }).eq("id", bestId);
            totalItemsMerged++;
          } else {
            const { data: ins } = await supabase.from("ai_knowledge_items").insert({
              user_id: userId,
              kind, subject, problem: it.problem, solution,
              steps: it.steps, flow_nodes: (it as any).flow_nodes || [], devices: it.devices, apps: it.apps, keywords: it.keywords, category,
              usage_count: 1,
              resolved_count: analysis.resolved ? 1 : 0,
              success_rate: analysis.resolved ? 1 : 0,
              confidence: computeConfidence(1, analysis.resolved ? 1 : 0),
              last_used_at: new Date().toISOString(),
              operators: [],
              source_conversation_ids: [c.id],
              status: "pending",
            }).select("id").single();
            if (ins?.id) existing.push({ id: ins.id, subject, tokenSet: newTokens });
            totalItemsCreated++;
          }
        }
        batchProcessed++;
      } catch (e) {
        totalErrors++;
        batchProcessed++;
        console.error("analyze err", e);
        await supabase.from("ai_training_conversations").update({
          analyzed_at: new Date().toISOString(),
          signal_quality: "none",
          status: "analysis_error",
          analysis_version: ANALYSIS_VERSION,
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
      .eq("user_id", userId).or(pendingFilter);

    const done = !remaining || remaining === 0;
    if (done) {
      await supabase.from("ai_training_jobs").update({
        status: "done", processed: totalForJob, errors: totalErrors,
        finished_at: new Date().toISOString(),
        message: `Concluído: ${totalForJob} analisadas • ${totalItemsCreated} novos neste lote • ${totalItemsMerged} agrupados neste lote • ${totalNoSignal} sem sinal`,
      }).eq("id", job!.id);
    }

    return json({
      ok: true, done, jobId: job!.id,
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
