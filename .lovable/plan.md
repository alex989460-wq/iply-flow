# Reformulação do módulo "Treinamento da IA"

Vou trocar o modelo atual de "pergunta/resposta bruta" por uma **Central de Conhecimento** que extrai procedimentos, fluxos, intenções e respostas oficiais do histórico real de atendimento (Evolution + Oficial). Nada é publicado sem sua aprovação.

## Fase 1 — Modelo de dados (nova arquitetura)

Novas tabelas (todas com RLS por `user_id`, GRANTs para `authenticated`/`service_role`):

- **`ai_conversations`** (substitui uso bruto de `ai_training_conversations`)
  - `source`, `channel`, `contact_phone`, `contact_name`, `operator_id`, `operator_name`
  - `started_at`, `ended_at`, `duration_seconds`, `message_count`
  - `status`, `tags[]`, `has_audio`, `has_image`, `has_file`
  - `problem_summary`, `solution_summary`, `resolved bool`, `device`, `app`, `category`
  - `analyzed_at`, `analysis_version`, `raw jsonb`

- **`ai_knowledge_items`** (unifica tudo — pending/approved)
  - `kind` enum: `procedure` | `flow` | `intent` | `official_answer` | `business_rule` | `tutorial`
  - `subject`, `problem`, `solution`, `steps jsonb` (procedimento), `flow_nodes jsonb` (fluxo)
  - `category`, `devices[]`, `apps[]`, `tags[]`, `keywords[]`
  - `usage_count`, `resolved_count`, `success_rate`, `confidence`, `last_used_at`
  - `operators jsonb` (top operadores + contagem), `source_conversation_ids[]`
  - `status`: `pending` | `approved` | `rejected` | `merged_into`
  - `merged_into_id`, `embedding vector(1536)`, `approved_at`, `approved_by`

- **`ai_analysis_queue`** — fila de conversas a analisar, com prioridade e retry
- Manter `ai_knowledge_entries` como destino final ao aprovar (compatível com o bot atual)

## Fase 2 — Pré-processamento (limpeza obrigatória)

Antes de mandar para a IA, uma função `sanitize()` remove:
- Saudações puras (`oi`, `bom dia`, `ok`, `obrigado`, `valeu`, `boa noite`…)
- Mensagens só com emoji/sticker/gif
- Mensagens < 3 caracteres úteis
- Comprovantes/PIX (regex de valores, "comprovante", `pix copiado`)
- Mensagens automáticas conhecidas do próprio robô
- Duplicatas consecutivas
- Anexos sem legenda contextual

Conversa que sobrar com menos de 2 turnos úteis (cliente+operador) é marcada `no_signal` e não vai para IA.

## Fase 3 — Análise por conversa (2 passes)

**Pass A — Compreensão da conversa** (`gpt-5.5-mini`, structured output):
Para cada conversa retorna:
```
{ problem, objective, solution, resolved, duration_bucket,
  device, app, category, tags[], operator_name,
  signal_quality: high|medium|none }
```
Grava direto em `ai_conversations`. Se `signal_quality=none` → não gera conhecimento.

**Pass B — Extração de conhecimento estruturado**:
A IA retorna 0..N itens tipados:
```
{ kind: procedure|flow|intent|official_answer|business_rule|tutorial,
  subject, problem, solution,
  steps: [ "abrir configurações", "aplicativos", "limpar cache", ... ],
  flow_nodes: [ { actor, action }, ... ],
  devices[], apps[], keywords[] }
```

Cada item gera embedding e passa por **agrupamento por similaridade** (cos ≥ 0.86, mesmo `kind` e `category`):
- Match → incrementa `usage_count`, adiciona operador, atualiza `success_rate`, junta `steps` (mescla, não sobrescreve), `last_used_at`
- Sem match → cria novo `pending`

Confiança é calculada:
```
confidence = min(1, 0.4 + 0.3*log10(usage_count+1) + 0.3*success_rate)
```

## Fase 4 — Painel de aprovação (novo)

Substitui a aba "Aprovação" por cartões inteligentes com:
- Badge do **tipo** (Procedimento/Fluxo/Intenção/Resposta Oficial/…) com cor
- Assunto, problema, solução
- **Passos numerados** (procedimento) ou **fluxograma vertical** (fluxo)
- Dispositivos/apps relacionados (chips)
- Métricas: usos, resolvidos, taxa de sucesso, confiança (barras)
- Top operadores
- Botão "Ver N conversas de origem" (modal com transcript)
- Ações: **Aprovar · Editar · Mesclar · Rejeitar · Converter em (Procedimento/Fluxo/Resposta Oficial)**

Aprovar → grava em `ai_knowledge_entries` (formato que o `evolution-autoreply` já consome) e marca item como `approved`.

## Fase 5 — Dashboard inteligente

Cards no estilo do dashboard principal (bordas coloridas, ícone, glow):
- Conversas importadas / analisadas / com sinal útil
- Conhecimentos por tipo (procedimento/fluxo/intenção/resposta oficial)
- Perguntas sem solução (top 10)
- Aplicativos mais citados / dispositivos mais usados (gráficos)
- Operadores com maior taxa de resolução (ranking)
- Pendentes de aprovação
- Categorias mais frequentes

## Fase 6 — Aprendizado contínuo

- `pg_cron` a cada 30min → chama `ai-training-analyze` só para conversas novas (`analyzed_at IS NULL`)
- Novo atendimento finalizado (trigger na `evolution_messages` quando gap > 6h) → enfileira em `ai_analysis_queue`
- Bot: `evolution-autoreply` já pega da `ai_knowledge_entries`, então aprovação → efeito imediato

## Detalhes técnicos

- Modelos: análise = `google/gemini-3-flash-preview` (rápido + barato + structured output); embeddings = `openai/text-embedding-3-small` (1536d, compatível com pgvector HNSW)
- Batches de 15 conversas por invocação, `EdgeRuntime.waitUntil` para background
- Limpeza é feita no edge (Deno), não gasta token de IA em lixo
- Similaridade cos ≥ 0.86 para agrupar; ≥ 0.92 sugere merge automático (ainda pendente)
- Auto-cancel de jobs travados > 15min via check no início de cada batch

## Fora de escopo desta rodada

- Transcrição de áudios (fica placeholder `has_audio=true`, sem análise)
- OCR de imagens/comprovantes (só detecção, não leitura)
- Auto-aprovação — tudo continua exigindo você aprovar

## Ordem de entrega

1. Migration (novas tabelas + enum + índices HNSW + RPC de match)
2. Edge `ai-training-analyze` reescrita (sanitize → pass A → pass B → agrupamento)
3. Edge `ai-training-approve` adaptada aos novos tipos
4. Página `AiTraining.tsx` — cartões inteligentes + dashboard novo
5. `pg_cron` para análise contínua

Se aprovar, entrego nessa ordem e mostro rodando após cada fase.
