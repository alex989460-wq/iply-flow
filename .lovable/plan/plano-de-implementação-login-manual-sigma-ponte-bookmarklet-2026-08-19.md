# Plano de Implementação - Login Manual Sigma (Ponte Bookmarklet)

O usuário relatou que a "Ponte Sigma" atual não está funcionando e deseja uma opção simples apenas para "logar". Atualmente, o sistema já possui uma lógica de ponte via bookmarklet, mas a interface pode estar confusa ou inacessível.

## Alterações Propostas

### 1. Simplificação da Interface de Ponte em `ResellerApiSettings.tsx`
- Garantir que a seção "Configuração da Ponte" seja exibida claramente dentro de cada conexão Sigma.
- Adicionar um status visual mais explícito (ex: "Aguardando sinal da aba" vs "Ponte Conectada").
- Adicionar um botão "Abrir Painel e Conectar" que abre a URL do Sigma em uma nova aba.

### 2. Melhoria da Fila de Comandos em `QuickRenewalPanel.tsx`
- Quando a renovação falhar por WAF (403), exibir um botão direto: "Usar Ponte de Login".
- Ao clicar, instruir o usuário a abrir a aba do painel e clicar no bookmarklet.

### 3. Edge Function `sigma-renew`
- Garantir que a lógica de "lookup" do job na tabela `sigma_bridge_jobs` seja resiliente.

## Detalhes Técnicos
- Utilizar a tabela `sigma_panel_connections` para armazenar o `bridge_token` e `last_bridge_seen_at`.
- O bookmarklet envia o `localStorage.getItem('token')` do domínio do Sigma para a Edge Function do sistema.
