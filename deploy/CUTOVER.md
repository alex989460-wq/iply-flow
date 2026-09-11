# Virada — trocar para a VPS sem parada perceptível

Tempo total de indisponibilidade de escrita: cerca de 10 minutos.
Escolha um horário de baixo movimento (madrugada).

## Antes da virada (dias antes, com produção no ar)

- [ ] VPS instalada (`install.sh`) e site abrindo por IP/domínio temporário.
- [ ] `preflight-vps.sh` terminou com `PREFLIGHT_APROVADO`.
- [ ] Banco importado e contagens conferidas (`import-to-vps.sh` diz "OK").
- [ ] Chaves preenchidas (`SECRETS.md`) e funções publicadas.
- [ ] Recuperação de senha testada usando o SMTP próprio.
- [ ] Agendamentos criados na VPS, mas **desativados**:
      `update cron.job set active = false;`
- [ ] IP da VPS liberado nos painéis que filtram por IP.
- [ ] Testado no domínio temporário: login, checkout Efí, checkout Mercado Pago,
      renovação rápida em cada painel, ativação de app, disparo em massa,
      cobrança agendada, indicação, tarefas.
- [ ] TTL do DNS de `supergestor.top` reduzido para 300 segundos (24h antes).

## Dia da virada

1. **Congelar o antigo**
   - Desativar todos os agendamentos do ambiente atual.
   - Avisar no sistema (opcional) que haverá 10 minutos de manutenção.
   - Não desligar nem excluir o ambiente antigo; ele será a reversão por 48h.

2. **Sincronizar o delta**
   ```bash
   bash deploy/scripts/export-from-cloud.sh          # novo dump
   bash deploy/scripts/import-to-vps.sh ./export-...  # importa por cima
   ```
   Como o dump é completo e a importação recria as linhas, o mais seguro é
   limpar as tabelas de dados no destino antes deste segundo import
   (o script já avisa diferenças de contagem).
   Confirme novamente que `select count(*) from cron.job where active;` retorna
   zero antes de importar.

3. **Virar o DNS**
   - Apontar o registro A de `supergestor.top` (e `www`) para o IP da VPS.
   - Rodar `certbot --nginx -d supergestor.top` se o SSL ainda não estiver ativo.

4. **Ligar a VPS de verdade**
   ```sql
   update cron.job set active = true;
   ```
   Só execute isto depois de confirmar que o domínio já responde pelo IP novo.

5. **Reapontar webhooks externos**
   Os caminhos continuam idênticos — só confirme que cada plataforma responde
   no novo destino depois da propagação:
   - Meta (WhatsApp): webhook de mensagens e de status.
   - Cakto: webhook de pagamento.
   - Efí: webhook Pix (cada revendedor, se cadastrado individualmente).
   - Mercado Pago: notificação de pagamento.
   - Evolution: webhook das instâncias.

6. **Validar em produção (15 minutos)**
   - [ ] Login de um revendedor.
   - [ ] Uma cobrança agendada saindo (oficial e Evolution).
   - [ ] Um Pix gerado e pago em valor mínimo.
   - [ ] Uma renovação rápida.
   - [ ] Chat recebendo mensagem.

## Reversão (se algo der errado)

- Voltar o registro A do DNS para o destino anterior (propaga em ~5 min com TTL 300).
- Reativar os agendamentos do ambiente antigo.
- O ambiente antigo permanece intacto por 48 horas justamente para isso.
- Se a VPS já recebeu pagamentos ou cadastros, exporte essas escritas antes de
  reverter; não reative o antigo até conciliá-las para evitar perda ou duplicidade.

## Depois de 48 horas estáveis

- [ ] Conferir backups rodando (`/opt/supergestor/backups`).
- [ ] Configurar cópia dos backups para fora da VPS (`RCLONE_REMOTE`).
- [ ] Encerrar o ambiente antigo.
- [ ] Remover a função temporária `migration-export` e seus segredos.

## Extensão do WhatsApp Web

A extensão (`extension/`) tem o endereço do servidor fixo em três arquivos:
`manifest.json`, `background.js` e `wa-extract.js`. Antes da virada, troque o
endereço antigo por `https://supergestor.top`, gere o `.zip` novamente e
reinstale nos navegadores que usam o extrator de grupos.

```bash
grep -rl "fphqfgxfeaylldpxjqan.supabase.co" extension/ \
  | xargs sed -i 's|https://fphqfgxfeaylldpxjqan.supabase.co|https://supergestor.top|g'
```
