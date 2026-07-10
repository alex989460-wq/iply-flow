## Uniplay (searchdefense.top) auto-renewal

Boa notícia: a API do Uniplay (`gesapioffice.com`) usa apenas **JWT Bearer** — sem captcha, sem cookies de sessão. Diferente do P2Cine, **não precisa de extensão**: dá para renovar 100% pelo backend, como Rush / The Best / NATV.

### Endpoints descobertos (via HAR)
```
POST https://gesapioffice.com/api/login
  body {"username","password","code":""}
  → { access_token, crypt_pass, id, owner_id, expires_in: 129600 }

GET  /api/users-iptv?reg_password=<crypt_pass>       ← lista IPTV
GET  /api/users-p2p                                   ← lista P2P
PUT  /api/users-iptv/{id}   body {"action":1,"credits":N}   ← estender IPTV
PUT  /api/users-p2p/{id}    body {"action":1,"credits":N}   ← estender P2P

Header em toda chamada autenticada: Authorization: Bearer <access_token>
```

### O que será feito

1. **Nova Edge Function `uniplay-renew`** (padrão idêntico a `rush-renew` / `the-best-renew`):
   - Login → guarda `access_token` + `crypt_pass` em memória por request.
   - Pesquisa o `username` do cliente **na lista IPTV E na lista P2P** (as duas, sempre).
   - Para cada match encontrado, faz `PUT` com `credits = meses do plano` (calculado por `duration_days/30`, mínimo 1).
   - Retorna sucesso se pelo menos uma renovação passar; loga em `pending_manual_renewals` se falhar.
   - Se cliente aparece nos dois painéis (IPTV + P2P), renova nos dois.

2. **Detecção do servidor Uniplay** em `servers.host`:
   - Palavras-chave: `uniplay`, `searchdefense`, `gesapioffice`.
   - Adiciona no roteador de renovação existente (mesmo lugar onde já cai P2Cine/Rush/etc).

3. **Card "Uniplay" em `ResellerApiSettings`** (aba API Externa):
   - Campos: `uniplay_username`, `uniplay_password` (persistidos em `reseller_api_settings`).
   - Botão "Testar login" chama `uniplay-renew` com `action:"test"` e mostra id/username retornados.

4. **Keepalive de sessão**:
   - Não necessário — o JWT dura 36h e sempre pegamos um novo no início de cada renovação. Sem estado a manter.
   - Se você quiser evitar re-login em toda chamada, faço cache do token em memória do worker por ~30h (opcional; digo se quer).

5. **Meses vindos do plano**: mesma regra do P2Cine — `credits = round(plans.duration_days / 30)`, respeitando `plan_name` do `pending_manual_renewals`.

### Detalhes técnicos

- Colunas novas em `reseller_api_settings`: `uniplay_username text`, `uniplay_password text` (migration).
- `uniplay-renew` recebe `{ customer_id, username, plan_name, owner_id }` e devolve `{ ok, renewed_in: ["iptv"|"p2p"], new_expiration }`.
- Corpo do PUT: `{"action":1,"credits":<meses>}` — `action:1` é "estender" (extraído do request real do painel).

### Fora do escopo (não vou fazer sem você confirmar)
- Extensão de browser para Uniplay (**desnecessária** — API é direta).
- Ajustes no fluxo do popup do P2Cine.
- Sincronização/importação de clientes Uniplay para o SuperGestor.

Confirma que posso seguir assim? Se sim, executo tudo (migration + edge function + card na aba de API Externa + roteamento).