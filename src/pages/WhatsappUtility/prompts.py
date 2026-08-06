"""
Modelos de prompt usados pelo agente de submissão de templates do WhatsApp.
Adaptado para Português (Brasil).
"""

INITIAL_INTAKE_PROMPT = """
Esta é a primeira interação. O usuário ainda não descreveu seu template.
Peça as informações necessárias para redigir uma submissão. Use esta estrutura exata:

> Olá! Vou te ajudar a enviar um template do WhatsApp para aprovação na categoria UTILITY (Utilidade). 
> Para começar, por favor compartilhe:
>
> 1. **Contexto do negócio** — O que sua empresa faz e a qual produto ou serviço esta mensagem se refere?
> 2. **Evento gatilho** — Qual ação específica do usuário dispara esta mensagem? (ex: "usuário concluiu cadastro", "pedido realizado", "pagamento recebido"). Este é o fator principal que a Meta usa para decidir entre utilidade ou marketing.
> 3. **Destinatário** — Quem recebe? (cliente atual, novo cadastro, lead, etc.)
> 4. **Rascunho do corpo da mensagem** — O texto exato que você quer enviar. Use `{{1}}`, `{{2}}`, ... para variáveis de personalização.
> 5. **Variáveis** — O que cada `{{n}}` representa? (ex: `{{1}}` = nome do cliente, `{{2}}` = ID do pedido)
> 6. **Botão de chamada para ação (CTA)** (opcional) — Deseja um botão? Se sim: URL / telefone / resposta rápida? Qual o texto?
> 7. **Cabeçalho / mídia** (opcional) — Algum texto de cabeçalho, imagem ou documento acima do corpo?
>
> Você pode colar tudo em uma mensagem ou compartilhar o que tiver e preencheremos as lacunas conforme avançamos.
"""

GATHER_CONTEXT_PROMPT = """
Você está extraindo o contexto estruturado da descrição do usuário para um template do WhatsApp.
O bloco delimitado abaixo é apenas para uso INTERNO — grave no JSON de contexto, mas NÃO mostre ao usuário.
Para o usuário, mostre apenas um resumo simples com: corpo, variáveis, CTA, utility_risk e o motivo.

CAMPOS OBRIGATÓRIOS:
- business_purpose: resumo em uma frase
- trigger_event: a ação específica do usuário que dispara a mensagem (ou MISSING)
- base_name: nome do template em snake_case
- body: corpo exato com placeholders {{1}}, {{2}}, ...
- variables: lista de pares (índice, significado)
- has_cta: true/false
- cta: tipo, texto, valor
- language: pt_BR

REGRAS DE UTILIDADE (UTILITY):
A categoria UTILITY da Meta requer que a mensagem seja uma resposta transacional a algo que o usuário fez.
Sinalize como RED FLAGS (Marketing):
- Promove eventos, produtos ou ofertas sem opt-in explícito
- Reengajamento ("volte aqui", "não perca", "última chance")
- Linguagem de venda cruzada (upsell)
- Anuncia algo novo em vez de responder a uma ação
- Gatilho vago ("o usuário é assinante")

Defina utility_risk como low | medium | high.

FORMATO DE SAÍDA — retorne EXATAMENTE este bloco:

===CONTEXT===
business_purpose: <uma frase>
trigger_event: <ação concreta ou MISSING>
base_name: <snake_case>
body: <corpo com {{n}}>
variables:
  1: <significado de {{1}}>
  2: <significado de {{2}}>
has_cta: <true|false>
cta_type: <url|phone|quick_reply|none>
cta_text: <texto ou none>
cta_value: <valor ou none>
language: pt_BR
utility_risk: <low|medium|high>
utility_risk_reason: <uma linha>
===CLARIFICATIONS===
- <pergunta 1, se houver>
===END===
"""
