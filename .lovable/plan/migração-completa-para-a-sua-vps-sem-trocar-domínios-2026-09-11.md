# Migração completa para a sua VPS (sem trocar domínios)

Objetivo: rodar 100% do sistema na sua VPS, mantendo `supergestor.top` e todos os links de revendedor/checkout como estão hoje, sem parada perceptível e sem depender da Lovable.

## O que muda e o que não muda

Não muda:
- Domínios (`supergestor.top`, links `/r/<revenda>`, páginas de pedido/consulta).
- Endereços dos webhooks externos (Cakto, Efí, Mercado Pago, Meta, Evolution) — mantemos os mesmos caminhos públicos, só apontando para a VPS.
- Dados: clientes, pagamentos, logs, templates, tarefas, indicações, configurações por revendedor.

Muda (interno, invisível para o usuário):
- Banco e autenticação passam a rodar na sua VPS.
- As funções de servidor passam a rodar na VPS.
- Backup, monitoramento e atualização passam a ser da sua infraestrutura (deixo automatizado).

## Arquitetura na VPS

```text
Internet (supergestor.top)
        |
     Nginx  (SSL Let's Encrypt, renovação automática)
        |
  +-----+---------------------------+
  |                                 |
Frontend (build estático)      Supabase self-hosted (Docker)
                                 - PostgreSQL + pgcron
                                 - Auth (GoTrue)
                                 - PostgREST + Realtime + Storage
                                 - Edge Functions (Deno)
```

Usamos Supabase self-hosted, não uma reescrita: o mesmo motor que roda hoje, na sua máquina. Isso preserva RLS, funções SQL, triggers de vencimento, agendamentos e o código das funções praticamente sem alteração.

## Fases

### Fase 1 — Preparo (sem tocar em produção)
- Instalar Docker, Nginx, Certbot e o stack Supabase self-hosted na VPS.
- Subir uma cópia do sistema em domínio temporário interno para testes.
- Gerar chaves novas (JWT, service role, anon) e cofre de segredos da VPS.

### Fase 2 — Migração de dados
- Exportar o banco atual completo (schema + dados + policies + funções + cron).
- Importar na VPS e conferir contagens tabela a tabela.
- Migrar usuários de autenticação com os hashes de senha preservados (ninguém precisa redefinir senha) — exportação direta da tabela de usuários, não recriação por convite.
- Migrar arquivos do storage (imagens de template, anexos).

### Fase 3 — Segredos e integrações
- Recriar na VPS todos os segredos: Meta, Evolution, Efí, Mercado Pago, Cakto, painéis (Rush, Sigma, Uniplay, P2Cine/kOffice, NATV, Clouddy, Smarters Max, IBO/Bob/Duplecast), 2Captcha, chave de IA.
- Substituir a IA da Lovable por chave direta do provedor (Gemini/OpenAI) nas funções que usam IA — mesma função, chave sua.

### Fase 4 — Testes com produção ainda no ar
- Cobrança agendada (oficial e Evolution), disparo em massa, checkout Efí e Mercado Pago, renovação rápida em cada painel, ativação de apps, indicação, tarefas/lembretes, login e 2FA.
- Rodar webhooks de teste apontando para o domínio temporário.

### Fase 5 — Virada (janela de ~10 minutos)
- Congelar escritas por poucos minutos, sincronizar o delta do banco (só o que mudou desde o dump).
- Apontar o DNS de `supergestor.top` para a VPS.
- Reapontar webhooks externos que exigem cadastro fixo (Meta, Efí, Mercado Pago, Cakto) — os caminhos continuam iguais, muda só para onde o DNS resolve.
- Manter o ambiente antigo em leitura por 48h como rede de segurança.

### Fase 6 — Operação segura
- Backup automático diário + snapshots a cada 10 min (mesma política de hoje), guardados fora da VPS.
- Firewall fechado (só 80/443 + SSH por chave), fail2ban, banco sem porta pública.
- Monitoramento de disponibilidade e alerta por WhatsApp/e-mail.
- Script de deploy para futuras atualizações do código.

## Riscos e como tratamos
- Cron/agendador duplicado durante a virada → desligamos o agendamento do lado antigo antes de ligar o novo, evitando cobrança dupla.
- Webhook chegando no ambiente antigo durante a propagação de DNS → o ambiente antigo fica em modo somente-encaminhar por 48h.
- Chaves de painéis com IP fixo autorizado → conferir e liberar o IP da VPS antes da virada.

## O que preciso de você
- Confirmar provedor/plano da VPS (Hetzner AX42 ou equivalente atende com folga).
- Acesso: crie um usuário com chave SSH e me passe apenas host + usuário; nunca envie senha no chat.
- Onde está registrado o DNS de `supergestor.top` (para o passo da virada).
- Se quer também trazer o WhatsApp CRM para a mesma máquina (cabe, em contêiner separado, sem conflito de portas).

## Entregáveis
- Script de instalação da VPS (um comando).
- Dump completo do banco + script de importação e verificação.
- Pasta de funções pronta para rodar na VPS.
- Guia de virada passo a passo, com plano de reversão.
- Rotina de backup e monitoramento já configurada.
