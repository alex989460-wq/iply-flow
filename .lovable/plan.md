
# Módulo "Treinamento da IA"

Vamos construir em 4 fases enxutas, porque o escopo é enorme e o valor real vem de já ter algo funcional para você aprovar conhecimento na primeira semana.

## Fase 1 — Base de dados + Importação do histórico

Novas tabelas (migration):

- `ai_training_conversations` — 1 linha por conversa importada
  - `id`, `user_id`, `source` (`evolution` | `oficial`), `contact_phone`, `contact_name`, `operator_id`, `started_at`, `ended_at`, `duration_seconds`, `message_count`, `status`, `tags[]`, `outcome`, `raw` jsonb (todas as mensagens)
- `ai_training_jobs` — status de importação/análise (progresso, total, erros)
- `ai_knowledge_candidates` — conhecimento gerado pela IA aguardando aprovação
  - `id`, `user_id`, `canonical_question`, `similar_questions[]`, `best_answer`, `category`, `tags[]`, `keywords[]`, `confidence`, `usage_count`, `success_rate`, `last_used_at`, `status` (`pending`|`approved`|`rejected`|`merged`), `source_conversation_ids[]`, `embedding vector(1536)`
- Extensão: adicionar `embedding vector(1536)` também na `ai_knowledge_entries` existente (aprovação vira INSERT lá).
- pgvector + índice HNSW.
- GRANTs para `authenticated` + `service_role`, RLS por `user_id`.

Edge functions:

- `ai-training-import` — recebe `{ source, from, to }`, lê `evolution_messages` (para Evolution) e as tabelas de mensagens do CRM Oficial, agrupa por `contact_phone` em conversas (janela de inatividade 6h), popula `ai_training_conversations`. Progresso em `ai_training_jobs`.
- Reaproveita histórico que já existe no banco — nada é buscado por API externa.

## Fase 2 — Processamento inteligente

Edge function `ai-training-analyze`:

1. Pega conversas ainda não analisadas em lotes de 20.
2. Para cada conversa monta o transcript e chama `openai/gpt-5.5-mini` via Lovable AI Gateway com structured output pedindo:
   - `intents[]` com `{ customer_question, operator_answer, category, subject, resolved: bool, procedure }`
3. Para cada intent gera embedding com `google/gemini-embedding-2`.
4. Faz busca por similaridade (cosine ≥ 0.86) em `ai_knowledge_candidates`:
   - Match → incrementa `usage_count`, atualiza `success_rate` (se `resolved=true`), adiciona `similar_questions`, atualiza `last_used_at`.
   - Sem match → cria candidato novo `status='pending'`.
5. Categorias fixas do negócio (instalação, login, ativação, renovação, pagamento, PIX, teste, suporte, compatibilidade, atualização, financeiro, revendedor, outros).

## Fase 3 — Painel de Aprovação (`/ai-training`)

Nova página `src/pages/AiTraining.tsx` com 3 abas:

- **Importar**: botão "Importar histórico" (escolhe Evolution / Oficial / ambos, período). Mostra job progress.
- **Aprovação**: lista `ai_knowledge_candidates` `pending` ordenado por `usage_count`. Cada card:
  - editar pergunta canônica, resposta, categoria, tags, keywords, prioridade
  - ver perguntas semelhantes agrupadas
  - ver conversas de origem
  - botões: Aprovar (→ move para `ai_knowledge_entries`), Rejeitar, Mesclar com outro candidato
- **Estatísticas**: cards com total de conversas analisadas, conhecimentos gerados, top 10 perguntas, top respostas, categorias mais usadas, taxa de sucesso média, conversas não classificadas.

Rota nova em `App.tsx` + item no `Sidebar.tsx`.

## Fase 4 — Aprendizado contínuo + busca semântica no bot

- Trigger diário (pg_cron) que roda `ai-training-analyze` sobre novas conversas.
- Atualizar `evolution-autoreply` para, além do keyword-match atual, gerar embedding da mensagem do cliente e buscar top-1 em `ai_knowledge_entries` (cos sim ≥ 0.82). Se achar, usa `response_template`. Fallback = comportamento atual.
- Isso resolve o "Meu app não abre / tela preta / não acessa" mesmo com palavras diferentes.

## Detalhes técnicos

- Modelos: análise = `openai/gpt-5.5-mini` (barato + structured output OK), embeddings = `google/gemini-embedding-2` (default do gateway).
- Custos: análise em lote de 20 conversas por chamada para reduzir gasto.
- Nada é publicado sem sua aprovação — regra dura no backend (`ai-training-analyze` só grava em `ai_knowledge_candidates`, nunca em `ai_knowledge_entries`).
- Reaproveita a `ai_knowledge_entries` existente que o robô já consome — não quebra o fluxo atual.

## O que fica de fora deste plano (posso adicionar depois)

- UI de "operador responsável" e tempo de atendimento na aba estatísticas — depende de a Evolution/Oficial já marcarem operador; se não marcarem, mostro só total.
- Auto-resposta com IA generativa livre (sem base) — mantemos template controlado.

Se aprovar, começo pela Fase 1 (migration + edge de importação) e mostro rodando antes de seguir.
