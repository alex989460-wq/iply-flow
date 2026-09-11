# Plano: troca de senha nos painéis, sincronização 100% de senhas e integração Uniplay API

## Contexto
O usuário já encomendou a VPS Ryzen 7 9700X e quer continuar editando o sistema por aqui. A tarefa tem três partes:
1. Permitir trocar a senha do cliente diretamente nos painéis NATV, Rush, P2Cine e VPlay.
2. Puxar/atualizar as senhas de 100% dos clientes agora (sincronização massiva).
3. Implementar a API da Uniplay (o usuário não tem a documentação ainda).

## Parte 1 — Alteração de senha direto no sistema

### O que será feito
- Adicionar ação `change-password` (ou `update-password`) nas Edge Functions:
  - `natv-renew`
  - `rush-renew`
  - `p2cine-renew`
  - `vplay-renew`
- Cada função receberá `username`, `new_password` e `customer_id` (para resolver credenciais do revendedor).
- A senha também será salva no registro do cliente (`customers.password`).

### Detalhes técnicos
- NATV: usar endpoint da API que altera a senha do usuário (provavelmente `PUT /api/users/:id` ou similar). Fallback a tentar endpoints comuns caso a API retorne 404.
- Rush: usar endpoint autenticado com Bearer token para editar o usuário (`PUT /:type/user/:id` ou equivalente).
- P2Cine: usar a API interna do painel (`/clients/api/`) com token JWT para alterar a senha do cliente.
- VPlay: atualizar direto no MySQL na coluna `password` da tabela de usuários.

### Interface
- Botão "Alterar senha" na ficha do cliente (`Customers.tsx`) e no painel de Renovação Rápida (`QuickRenewalPanel.tsx`).
- Modal com campo para nova senha, opção "gerar senha forte" e confirmação.
- Feedback claro: sucesso, erro do painel ou usuário não encontrado.

## Parte 2 — Sincronização 100% das senhas

### O que será feito
- Reescrever `sync-all-passwords` para usar credenciais por revendedor (`reseller_api_settings`), não apenas variáveis globais.
- Para cada revendedor que tenha credenciais de painel configuradas, buscar todos os usuários na API/MySQL e atualizar `customers.password` quando o `username` casar.
- Cobrir NATV, Rush, P2Cine e VPlay. The Best já está parcialmente implementado e será ajustado para usar credenciais por revendedor também.
- Adicionar botão manual "Sincronizar senhas" na tela de Configurações > APIs dos Painéis e/ou Clientes.
- Agendar execução automática diária (pg_cron) para manter senhas atualizadas.

### Detalhes técnicos
- Iterar por `reseller_api_settings` onde houver credenciais de cada painel.
- Para cada painel, paginar resultados e fazer `update` em `customers` filtrando por `created_by` do revendedor + `username`.
- VPlay: conectar no MySQL do revendedor, listar todas as linhas e atualizar por username.
- Registrar log de quantos foram atualizados por painel/revendedor.
- Evitar sobrescrever senhas quando a API não retornar senha (manter a existente).

## Parte 3 — Integração Uniplay via API

### O que será feito
- Reaproveitar a estrutura da `uniplay-renew`, que hoje usa Selenium/proxy.
- Quando o usuário fornecer a documentação/credenciais da API oficial da Uniplay, implementar endpoints de:
  - autenticação;
  - listagem de usuários IPTV/P2P;
  - renovação de créditos;
  - alteração de senha (se existir);
  - sincronização de senhas.
- Manter o fallback pelo navegador/proxy caso a API não esteja disponível.

### Bloqueio
- Usuário ainda não tem o link da documentação, endpoint base, usuário/token ou exemplo de requisição da API Uniplay.

## Critérios de aceite
- É possível abrir um cliente e clicar em "Alterar senha": a senha muda no painel e no SuperGestor.
- É possível clicar em "Sincronizar senhas" e ver contagem de senhas atualizadas por painel.
- As senhas param de ficar desatualizadas entre painel e SuperGestor.
- Uniplay: implementação inicia quando o usuário entregar documentação/credenciais.

## Notas
- Não alterar fluxos de renovação existentes, apenas adicionar ações novas.
- Manter as credenciais por revendedor; não depender só de variáveis de ambiente.
- Respeitar o isolamento: cada revendedor só sincroniza/sua própria base de clientes.
