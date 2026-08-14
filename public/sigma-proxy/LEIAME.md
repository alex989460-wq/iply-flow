# Mini Proxy Sigma — SuperGestor

O painel Sigma bloqueia chamadas vindas de servidores de nuvem. Este mini proxy roda na sua
máquina (ou numa VPS/conexão residencial) e repassa as chamadas usando o seu IP, que o painel aceita.

## 1. Instalar

Instale o Node.js 18 ou superior: https://nodejs.org

Baixe o arquivo `server.js` desta mesma pasta.

## 2. Escolher uma chave secreta

Crie uma senha longa (mínimo 12 caracteres). Ela protege o seu proxy para que só o SuperGestor possa usá-lo.

## 3. Iniciar o proxy

Windows (PowerShell):

```powershell
$env:SIGMA_PROXY_SECRET="sua-chave-secreta"; node server.js
```

Linux ou macOS:

```bash
SIGMA_PROXY_SECRET="sua-chave-secreta" node server.js
```

Deve aparecer: `Mini Proxy Sigma ativo em http://localhost:8787`.

## 4. Publicar com túnel gratuito

Instale o `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) e rode:

```bash
cloudflared tunnel --url http://localhost:8787
```

Copie a URL gerada, algo como `https://algo-aleatorio.trycloudflare.com`.

## 5. Configurar no SuperGestor

Em **Configurações → APIs → Painel Sigma**, preencha:

- **URL do Proxy**: a URL do túnel
- **Chave do Proxy**: a mesma chave secreta

Clique em **Testar conexão Sigma**. Se aparecer a lista de servidores, está funcionando.

## Observações

- O proxy só aceita repassar endereços que terminem em rotas `/api/` do painel Sigma.
- Nenhuma senha do painel fica salva no proxy: ele apenas repassa a requisição.
- Enquanto o proxy estiver desligado, o SuperGestor tenta a conexão direta e avisa se o painel bloquear.
- Para rodar sempre ativo, use um túnel nomeado do Cloudflare ou mantenha o computador ligado.
