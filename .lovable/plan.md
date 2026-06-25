## Escopo: Fase 1 — migrar pagamento e cobrança automática para CRM Oficial

Mantém Zap Responder vivo para os outros fluxos (confirm-conflict, confirm-activation, daily-report, mass-broadcast, bot-triggers). Sua escolha foi **falhar e registrar no log** se o CRM Oficial não conseguir entregar — sem fallback para Zap Responder.

### 1. Novo helper compartilhado: `_shared/crm-oficial-send.ts`

Função única `sendViaCrmOficial({ resellerId, phone, body, templateId?, components? })` que:
- Lê `crm_oficial_settings` da revenda (URL + API key + channel_id padrão).
- POSTa em `crm-oficial-sync` action `whatsapp-send` (texto) ou `whatsapp-template-send` (template) — reaproveitando o que já está pronto e funcionando hoje no chat e na cobrança individual.
- Retorna `{ ok, status, error }` — quem chama decide o que logar.
- Sem fallback. Erro vira log em `message_logs` com `provider='crm-oficial'` e status detalhado.

### 2. `cakto-webhook` — substituir 22 call sites

Trocar cada `fetch('.../zap-responder', ...)` por `sendViaCrmOficial(...)`. Locais afetados:
- Confirmação ao cliente após pagamento aprovado (linhas ~311, ~1168, ~2263).
- Alertas ao admin (telefone de notificação) sobre renovações automáticas e falhas (linhas ~571–639, ~1177–1194, ~1991–2025, ~2320–2460, ~2972).
- Mensagens de conflito / múltiplas telas (linhas ~2197+, ~2372, ~2433).

**Importante:** mensagens ao cliente que acabou de pagar têm boa chance de estarem dentro da janela 24h (acabou de abrir o link Cakto). Mensagens ao admin **provavelmente vão falhar** fora da janela 24h porque você não está usando templates. Vou marcar essas como `severity=warn` no log e seguir — você decide depois se cria template para alerta admin.

### 3. `send-billing` + `send-billing-batch`

Hoje a lógica é: se a revenda configurou schedule `crm-oficial`, usa CRM Oficial; senão usa Zap Responder. Vou:
- Remover o ramo Zap Responder dessas duas funções (4 call sites em `send-billing-batch`, 1 em `send-billing`).
- Toda revenda passa a usar CRM Oficial nesses dois endpoints, sempre via template (já é o comportamento atual quando schedule = crm-oficial).
- Se a revenda não tem template configurado ou canal: erro 400 claro no retorno + linha em `message_logs`.

### 4. `scheduled-billing` (cron 8h/etc.)

Já tem o branch `crm-oficial` que você implementou. Vou remover o branch Zap Responder para garantir consistência. Se uma revenda não tem CRM Oficial configurado: skip + log, **não** cai mais para Zap Responder.

### 5. NÃO faz parte desta fase

- `confirm-conflict-renewal`, `conflict-button-webhook`, `confirm-activation`, `daily-report`, `mass-broadcast`, `zap-responder`, `bot_triggers` — continuam exatamente como estão.
- Deletar `zap-responder` e secret `ZAP_RESPONDER_TOKEN` — **NÃO** nesta fase. Ainda em uso pelos itens acima.
- UI/Settings/Tutorial — sem mudança nesta fase.

### 6. Validação ao final

- `tsgo` no projeto + deploy das 4 funções alteradas.
- Você dispara um teste real: 1 pagamento Cakto sandbox/produção pequeno e 1 cobrança manual via `Billing > Enviar agora`. Eu checo `edge_function_logs` e `message_logs` e te mostro o resultado antes de partir para Fase 2.

### Riscos que assumo com esse plano
- Alertas admin do `cakto-webhook` podem falhar fora da janela 24h até você criar um template para isso. Hoje funcionam porque Zap Responder envia texto livre sem janela.
- Qualquer revenda que tinha Zap Responder configurado e **não** configurou CRM Oficial vai parar de receber cobranças automáticas. Vou listar no log quais revendas ficaram sem envio na primeira execução pós-deploy.

Aprova esse recorte? Se sim, executo direto.
