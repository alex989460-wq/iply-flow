## Contexto

O bug de ordem das mensagens antigas já foi corrigido nesta rodada (merge agora reordena por `created_at` e o `thread` também).

O "CRM Oficial" que aparece nos prints (`/crm-oficial/chat`) é na verdade um **iframe do ZapCRM** (`zapcrm.top/embed/inbox`) — não é código nosso. Então "igual ao CRM" significa recriar o visual do ZapCRM dentro do nosso `EvolutionChat.tsx` (3.365 linhas). Não dá pra reaproveitar componente — é reconstrução visual.

## Escopo do redesign

Vou refazer as 4 superfícies visuais principais do `EvolutionChat`, mantendo 100% da lógica atual (envio, webhooks, presença, reações, quick renewal, drawers de mídia/contato, gatilhos de bot, etc.).

### 1. Sidebar de conversas (esquerda)
- Header "Chat — Atendimento no estilo WhatsApp Web" com badge verde "X novas".
- Busca em pill arredondada com ícone à esquerda + botão refresh redondo à direita.
- Abas em pill: Todas / Não lidas / Abertas / Fechadas com contagem embaixo.
- Selects em pill: "Todos os canais", "Etiquetas", "Todos os números".
- Contador "N conversa(s)" + badge "X novas".
- Item de conversa: avatar colorido por inicial, nome em bold, prévia da última msg com ícone de tipo, timestamp relativo ("4 minutos"), protocolo `#XXXXXX-XXXX` em ciano embaixo, badge verde de não lidas, menu `⋮`.

### 2. Header do chat (topo direito)
- Avatar + nome + badge do canal (ex: "WhatsApp Business (Meta)") + protocolo embaixo.
- Botões redondos: refresh, "Fechar" (verde), busca, info, mais opções.

### 3. Área de mensagens
- Fundo escuro `#0b141a` mantido (já era WhatsApp-like).
- Bolhas com raio maior e sombra mais sutil, tipografia 15px.
- Separadores de dia em pill central.
- Card verde-esmeralda para mensagens de template (com título em bold e corpo formatado como no print).
- Ícone "🎧" ao lado do nome nas conversas que têm agente vinculado.

### 4. Composer (inferior)
- Barra em pill arredondada, ícones à esquerda (anexo, emoji, imagem), textarea limpa no meio, ícones à direita (mic, docs, escudo), botão enviar verde circular.

## Fora de escopo (não mudo)
- Lógica de envio, edge functions, webhooks, realtime, cache, reações, respostas rápidas, painel Quick Renewal, drawers de contato/mídia/gatilhos de bot.
- `EvolutionInstances`, `UnifiedChat`, `CrmOficialChat`.
- Cores globais do design system.

## Detalhes técnicos

- Arquivo único: `src/pages/EvolutionChat.tsx`.
- Substitui apenas os JSX blocks das 4 superfícies (sidebar ~2080-2400, header ~2410-2470, thread render ~2470-2700, composer ~2700-2850).
- Reaproveita hooks e estados existentes (`conversations`, `thread`, `selectedPhone`, `messagesRef`, `unreadCount`, etc.).
- Novos utilitários locais: `getInitials(name)`, `getAvatarColor(phone)`, `formatRelative(iso)`, `formatProtocol(phone, created_at)`.
- Sem migração, sem edge function, sem novas dependências.

## Risco e verificação

- Risco: quebrar interações complexas embutidas no JSX (menu de contexto, drag/drop, upload). Vou preservar todos os handlers atuais, só troco wrappers/classes/estrutura visual.
- Verificação: `bun run build` + smoke visual do preview em `/evolution/chat` (sidebar carregando, abrir uma conversa, enviar msg, carregar antigas — ver se a ordem se mantém).
