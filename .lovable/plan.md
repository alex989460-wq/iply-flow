# Loja de Créditos com Recarga Automática

## Objetivo
Transformar a loja de créditos em uma experiência visual semelhante à Renovação Rápida e, após o pagamento, enviar os créditos diretamente ao usuário correto no painel externo quando a API desse painel oferecer uma operação de transferência segura.

## Escopo

### 1. Catálogo isolado por revendedor
- Manter cada revendedor vendo e configurando somente os próprios servidores, tabelas, vendas e compradores.
- Relacionar cada servidor ao tipo de painel e à conexão daquele revendedor, sem usar credenciais de outra conta.
- No link público, localizar apenas uma sub-revenda vinculada ao vendedor; não aceitar uma conta encontrada globalmente por coincidência de usuário, telefone ou e-mail.

### 2. Configuração moderna das tabelas
- Substituir o editor atual por um fluxo mais visual: servidor, status da automação, faixas de quantidade e preço, prévia imediata e publicação.
- Continuar permitindo colar uma tabela inteira, mas validar sobreposição, intervalos vazios, valores inválidos e quantidade mínima exigida pela API.
- Mostrar por servidor se a entrega será automática ou se ainda depende de lançamento manual.

### 3. Checkout com o visual da Renovação Rápida
- Aplicar o mesmo padrão compacto: superfícies translúcidas, cabeçalho destacado, cartões de servidor, seleção clara, resumo fixo e feedback de conta localizada.
- Melhorar a experiência no celular, com etapas curtas: identificar conta, escolher servidor e quantidade, revisar, pagar e acompanhar a entrega.
- Exibir preço unitário, total, forma de pagamento e situação da recarga sem expor credenciais ou endereços internos.

### 4. Entrega automática nos painéis
- Criar uma camada única de adaptadores para consultar saldo, localizar a sub-revenda e transferir créditos.
- Implementar primeiro o NATV/NATV² usando a operação pública e documentada `POST /reseller/credits`, com Bearer token, usuário de destino, quantidade mínima e limites de chamadas.
- Reaproveitar as conexões já cadastradas por revendedor e validar se o usuário é realmente sub-revenda direta antes de gerar a cobrança.
- Adicionar os demais painéis somente quando a operação de crédito estiver confirmada na API real; renovação de cliente não será tratada como transferência de créditos.
- Quando um painel não tiver transferência confirmada, registrar o pagamento e mostrar uma pendência clara para entrega manual, sem lançar saldo interno como se a recarga externa tivesse ocorrido.

### 5. Segurança e consistência financeira
- Tornar a confirmação e entrega idempotentes: o mesmo Pix/webhook nunca poderá creditar duas vezes.
- Registrar tentativa, resposta do painel, saldo anterior/posterior, horário e erro em cada pedido.
- Separar os estados `aguardando pagamento`, `pago`, `enviando`, `entregue` e `falhou`, com opção segura de tentar novamente.
- Fazer a alteração de saldo interno de forma atômica para evitar duplicidade em dois navegadores ou webhooks simultâneos.

### 6. Histórico e acompanhamento
- Nas vendas, mostrar comprador, usuário do painel, servidor, quantidade, valor, origem do pagamento e situação da entrega.
- Permitir abrir cada pedido para consultar tentativas e motivo exato de eventual falha.
- Atualizar o checkout automaticamente quando o pagamento e a recarga forem confirmados.

## Detalhes técnicos
- Atualizar `credit-store`, os webhooks Efí/Mercado Pago e as telas de configuração/checkout.
- Criar adaptadores isolados por provedor; o adaptador NATV usará `/reseller/me`, `/reseller/subreseller/search` e `/reseller/credits`.
- Criar migração para estado de entrega, identificador externo, tentativas e função transacional/idempotente.
- Preservar o sistema atual de renovação de clientes e não alterar cálculos de vencimento.
- Validar com testes sem cobrança real, simulação de webhook duplicado, conta de outra revenda, quantidade abaixo do mínimo, saldo insuficiente e telas desktop/celular.
