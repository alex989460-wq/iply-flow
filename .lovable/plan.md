# Renovação automática P2Cine via extensão do navegador

## Ideia central

Nada de burlar captcha ou copiar cookie para o backend (o P2Cine derruba a sessão quando isso acontece). Em vez disso, uma **extensão do Chrome roda dentro do seu próprio navegador**, usando **sua sessão já logada** no `daily3.news`. Ela pergunta a cada X segundos ao nosso backend "tem cliente P2Cine pra renovar?" e, quando tem, executa a renovação como se você tivesse clicado — do lado do painel é indistinguível de uso humano legítimo.

Você mantém uma aba do P2Cine aberta em segundo plano no seu PC (pode ficar minimizado). Enquanto essa aba existir e você estiver logado, as renovações rodam sozinhas.

## Fluxo

```text
Cakto webhook → pending_manual_renewals (reason=p2cine_auto_queue)
                        ↓
                edge fn: p2cine-queue (GET próximo item + POST resultado)
                        ↓
             Extensão Chrome (polling 15s na aba daily3.news)
                        ↓
      fetch interno no painel P2Cine com a sessão real do usuário
                        ↓
             POST resultado → marca pendência como resolvida
                        ↓
               atualiza customers.due_date
```

## O que vou construir

### 1. Backend (edge function `p2cine-queue`)
- `GET ?token=XXX` — devolve o próximo item pendente (username, dias, id).
- `POST ?token=XXX` com `{id, success, message}` — marca como resolvido ou registra falha.
- Autenticada por `P2CINE_EXTENSION_TOKEN` (secret gerado, você cola na extensão uma vez).

### 2. Fila
- Reativar `p2cine-renew` para **não** tentar HTTP direto: apenas insere linha em `pending_manual_renewals` com `reason='p2cine_auto_queue'`.
- Extensão consome dessa fila.

### 3. Extensão Chrome (`/extension/`)
- `manifest.json` MV3, permissões: `storage`, `alarms`, host `https://daily3.news/*` e nosso Supabase.
- `background.js`: alarme a cada 15s → chama `p2cine-queue GET` → se tem item, envia mensagem pra content script da aba `daily3.news`.
- `content.js`: injetado em `daily3.news/clients/*`, faz `fetch` interno no endpoint de renovação usando a sessão logada, devolve resultado ao background.
- `popup.html`: campo pra colar o token + status ("Aba conectada / X renovações hoje").

### 4. UI no app
- Card em Configurações → APIs Externas → P2Cine:
  - Botão "Baixar extensão" (`/p2cine-extension.zip`).
  - Passos de instalação (Load unpacked).
  - Campo mostrando o token pra colar na extensão.
  - Status: "Última renovação: há 2min" (lê de `pending_manual_renewals`).

## Detalhes técnicos

- **Token**: `generate_secret P2CINE_EXTENSION_TOKEN` (64 chars). Extensão manda em header `X-Extension-Token`; edge fn compara com `Deno.env`.
- **Endpoint de renovação P2Cine**: precisamos identificar a URL exata que o botão "Renovar" do painel dispara. Vou logar via `p2cine-renew` antigo (já temos o path `/clients/renew` provavelmente) — se estiver errado, você abre F12 → Network no painel, clica renovar em 1 cliente e me manda o request; ajusto o content script.
- **Segurança**: extensão só age em `daily3.news`; token da extensão é separado do login do painel; se vazar, você regenera pelo botão "Rotacionar token".
- **Sem burla**: extensão só faz o que você faria clicando. Captcha, se aparecer no meio, para a fila e notifica ("resolva o captcha manualmente"); depois volta a rodar.

## Alternativas que descartei

- **Backend com Playwright headless resolvendo captcha** → viola ToS hCaptcha, quebra a cada update do painel, e ainda derruba sua sessão.
- **Reusar PHPSESSID no backend** → já testado, o P2Cine invalida (memória `p2cine-automation-block`).
- **API oficial do P2Cine** → ideal, mas depende do provedor liberar; pode pedir em paralelo.

## Ordem de entrega

1. Secret + edge function `p2cine-queue`.
2. Refazer `p2cine-renew` para só enfileirar.
3. Extensão + ZIP em `/public/p2cine-extension.zip`.
4. Card de configuração com download e token.

Confirma que posso seguir? Se sim, na hora que a extensão ficar pronta te peço 30s pra abrir F12 e confirmar a URL exata do botão "Renovar" pra travar o content script.
