# Pacote de migração — SuperGestor na sua VPS

Este diretório contém tudo o que é preciso para rodar o sistema 100% na sua VPS,
mantendo os mesmos domínios (`supergestor.top` e todos os links atuais).

Ordem de execução:

1. `install.sh` — prepara a VPS (Docker, Nginx, Certbot, firewall, stack Supabase self-hosted).
2. `scripts/export-from-cloud.sh` — exporta banco + usuários + storage do ambiente atual.
3. `scripts/import-to-vps.sh` — importa tudo na VPS e confere as contagens.
4. `SECRETS.md` — recadastrar as chaves das integrações.
5. `scripts/deploy-functions.sh` — sobe as 99 funções de servidor na VPS.
6. `scripts/deploy-frontend.sh` — compila e publica o site.
7. `cron/jobs.sql` — recria os 13 agendamentos apontando para a VPS.
8. `scripts/preflight-vps.sh` — valida a VPS sem ativar jobs nem alterar o domínio.
9. `CUTOVER.md` — virada de DNS e webhooks, com plano de reversão.
10. `scripts/backup.sh` — backup automático (instalado pelo `install.sh`).

Nada aqui altera o ambiente atual: os passos 1 a 8 rodam em paralelo, com a
produção no ar. Só o passo 9 troca o tráfego.

Antes de combinar a virada, rode na VPS:

```bash
sudo bash /opt/supergestor/repo/deploy/scripts/preflight-vps.sh
```

O resultado deve terminar em `PREFLIGHT_APROVADO`. A checagem reprova se houver
agendamentos ativos ou se a cópia dos arquivos ainda não estiver completa.

## Requisitos da VPS

- Ubuntu 22.04 ou 24.04, root ou usuário com sudo.
- Mínimo confortável: 8 vCPU, 32 GB RAM, 500 GB NVMe (Hetzner AX42 sobra).
- Portas abertas: 80, 443 e SSH. Banco nunca exposto.

## Estrutura instalada na VPS

```text
/opt/supergestor
  ├─ supabase/          stack self-hosted (Postgres, Auth, PostgREST, Realtime, Storage, Functions)
  ├─ app/               build do site (servido pelo Nginx)
  ├─ functions/         código das Edge Functions (Deno)
  ├─ backups/           dumps automáticos
  └─ .env               segredos da instalação
```
