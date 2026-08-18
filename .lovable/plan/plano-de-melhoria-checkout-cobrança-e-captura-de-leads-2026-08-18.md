# Plano de Melhoria: Checkout, Cobrança e Captura de Leads

Este plano resolve a página em branco da Cakto, a integração dos gateways de pagamento e a funcionalidade de captura de leads via pesquisa no Google (Maps/Search).

## Alterações Propostas

### 1. Ajuste de Página e Navegação
- **Cakto**: Mover e integrar o `CaktoSettingsCard` permanentemente dentro da aba **Pagamentos** em `BillingSettings.tsx`, garantindo que não fique em branco após a migração das APIs externas.
- **Identidade Visual**: Adicionar o logo da Cakto como ativo do sistema para uso em cards e cabeçalhos.

### 2. Capturador de Leads "Quentes" (Google Search)
- **Interface**: Adicionar o modo "Pesquisa Google" no `LeadCapture.tsx`.
- **Funcionalidade**: Permitir que o usuário digite termos como "Bares em Curitiba".
- **Inteligência**: Criar uma Edge Function que utiliza busca na web e IA (Gemini) para extrair nomes e telefones comerciais de resultados de busca.
- **Fluxo**: Os números extraídos passarão automaticamente pela validação de WhatsApp ativo antes de serem adicionados à lista de disparos.

### 3. Correção de Disparo Janela 24h
- **Upload de Imagem**: Corrigir a interface de upload para garantir que arquivos locais sejam processados corretamente via Supabase Storage.
- **Visual**: Refinar o layout para ser 100% responsivo em dispositivos móveis.

## Detalhes Técnicos
- Utilização de `lovable-assets` para gerenciamento de mídia.
- Nova Edge Function `google-lead-scraper` para orquestração de busca e extração.
- RLS garantindo que cada revendedor veja apenas seus próprios leads capturados.
