# Checkout do Revendedor + API Externa

Criar um checkout público estilo `planos.socialplay.com.br`, um para cada revendedor, e uma API REST para sites externos (como o próprio SocialPlay) consumirem o mesmo fluxo. Reaproveita 100% da integração Efí já pronta e mantém o Cakto funcionando lado a lado.

## Fluxo do cliente final

1. Cliente abre `supergestor.top/r/socialtv` (slug do revendedor).
2. Vê a marca (logo + cor + nome) e a lista de planos ativos daquele revendedor.
3. Digita **telefone** → sistema lista os usuários vinculados àquele telefone.
4. Cliente **seleciona qual usuário** quer renovar.
5. Escolhe o plano → escolhe **Pix Efí (QR na hora)** ou **Cakto (link)**.
6. Pix Efí: QR aparece na tela + polling; ao confirmar, roda o mesmo pipeline de renovação automática do webhook Cakto.
7. Cakto: redireciona pro link já cadastrado no plano.

Sem senha, sem cadastro — igual ao SocialPlay atual.

## Página pública `/r/:slug`

- Layout escuro elegante inspirado no SocialPlay (grid de planos, badge "Mais Popular", "Economize X%").
- Personalização por revendedor: logo, cor primária, título.
- Estados: input telefone → lista de usuários encontrados → seleção de plano → tela de pagamento (QR Pix ou botão Cakto) → confirmação.
- Mensagem clara quando o telefone não bater com nenhum cliente.

## API REST (para o SocialPlay e outros sites externos)

Base: `https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/reseller-api`
Autenticação: header `x-api-key: <chave do revendedor>`

Endpoints:
- `GET /plans` — lista planos públicos do revendedor.
- `POST /lookup` `{ phone }` — retorna clientes vinculados ao telefone.
- `POST /charge` `{ customer_id, plan_id, method: "pix"|"cakto" }` — cria cobrança Pix Efí (retorna QR + txid) **ou** devolve o link Cakto.
- `GET /charge/:txid` — status do Pix (pending / paid).
- Webhook `POST /webhook` no site externo (opcional, cadastrado no painel) recebe notificação de pagamento aprovado.

Cada revendedor gera/rotaciona sua chave numa nova aba **Integração** dentro de Configurações.

## Painel do revendedor

Nova aba **Checkout Público** em Configurações:
- Define **slug** (único, validado).
- Personaliza logo, cor primária e nome exibido.
- Ativa/desativa Pix Efí e Cakto no checkout (usa configuração Efí e `plans.checkout_url` já existentes).
- Copia link `/r/slug` e chave da API REST.

## Mudanças de banco

Uma migration adicionando:
- `public.reseller_checkout_settings` — slug (único), logo_url, brand_color, display_name, enable_efi, enable_cakto, api_key, webhook_url, is_active.
- Índice único em `slug` e `api_key`.
- RLS: dono edita o seu; leitura pública apenas por slug via edge function com service role.

Nenhuma tabela existente perde coluna. `efi_settings`, `efi_charges`, `plans`, `customers` permanecem intactos.

## Edge functions novas

- `reseller-checkout-data` (pública) — dados do slug: revendedor + planos + métodos habilitados.
- `reseller-checkout-lookup` (pública) — telefone → clientes.
- `reseller-checkout-charge` (pública) — cria Pix Efí (reutiliza `_shared/efi-client.ts`) ou retorna link Cakto, grava `efi_charges` com `owner_id` correto.
- `reseller-api` (autenticada por `x-api-key`) — mesmos recursos acima expostos como REST estável para sites externos.

O webhook Efí atual (`efi-webhook`) já processa a confirmação e dispara a renovação — não precisa mudar.

## Segurança

- Slug e telefone tratados como públicos, com rate-limit simples por IP na edge function.
- Telefone normalizado antes da busca (mesmo helper `src/lib/phone.ts`).
- API key gerada com `crypto.getRandomValues` (32 bytes) e mostrada uma única vez após rotação.
- Nunca expõe `SERVICE_ROLE_KEY` nem dados de outros revendedores.

## Ordem de execução

1. Migration (`reseller_checkout_settings`).
2. Edge functions: `reseller-checkout-data`, `reseller-checkout-lookup`, `reseller-checkout-charge`, `reseller-api`.
3. Página pública `src/pages/ResellerCheckout.tsx` + rota `/r/:slug`.
4. Card **Checkout Público** em Configurações (slug, marca, API key).
5. Verificação: build + fluxo manual de ponta a ponta em um slug de teste.

## Fora do escopo (podemos fazer depois se quiser)

- Login/área do cliente com senha e histórico.
- Subdomínio próprio (`socialtv.supergestor.top`) ou CNAME de domínio.
- Cartão de crédito recorrente.
