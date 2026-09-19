# Plano: custos e mensagens do WhatsApp por contato

## Situação encontrada
- A calculadora do SuperGestor hoje é apenas um simulador manual e possui preços fixos no código.
- O envio em massa mantém outra tabela de preços fixa, com valores e unidade diferentes.
- Os registros locais não guardam, por mensagem, canal, categoria financeira, status de cobrança e custo histórico suficientes.
- Mensagens não oficiais devem permanecer no total, sempre com custo Meta igual a R$ 0,00.
- A janela de 24 horas continuará separada da classificação financeira.

## Alterações propostas no ZapCRM
- Fazer uma migração somente aditiva para guardar em cada mensagem: canal usado, direção, identificador do provedor, categoria informada, status `charged/free/unknown`, custo, moeda e taxa de conversão aplicada.
- Criar uma tabela central de preços com vigência, mercado, moeda e categoria, protegida por usuário/administrador.
- Reaproveitar a conversa e o contato existentes; não criar histórico paralelo.
- Registrar o canal efetivamente escolhido depois da decisão do roteador híbrido, sem mudar sua prioridade ou fallback.
- Enriquecer mensagens oficiais somente com dados realmente retornados pela Meta. Sem evidência, salvar `unknown` e não somar custo.
- Manter mensagens não oficiais com custo Meta zero.
- Aplicar idempotência por identificador do provedor e chave estável para impedir contagem dupla entre as duas fontes.
- Adicionar ao detalhe do contato os totais pedidos e uma tabela expansível com as mensagens que compõem o custo.

## Alterações propostas no SuperGestor
- Substituir os preços fixos da calculadora pela configuração central vigente.
- Acrescentar uma visão de dados reais com totais, filtros por período e detalhamento por contato, sempre em BRL.
- Manter o simulador manual em uma aba separada e claramente identificado como estimativa.
- Unificar a estimativa do envio em massa com a mesma fonte de preços, evitando números divergentes.

## Arquivos e áreas previstos
### ZapCRM
- Migração nova para metadados financeiros e tabela de preços.
- Serviço de recebimento oficial: captura de identificadores e classificação disponível.
- Serviço de recebimento não oficial: marcação explícita do canal e custo zero.
- Serviço central de envio híbrido: registro do canal escolhido, sem alterar o roteamento.
- Consulta do detalhe do contato e componente visual de custos.

### SuperGestor
- `src/pages/CostCalculator.tsx`: simulador + visão real.
- `src/pages/MassBroadcast.tsx`: consumir a fonte central de preços, sem alterar o envio.
- Um pequeno módulo compartilhado para formatação e cálculo financeiro.
- Migração/consulta segura para expor ao SuperGestor apenas os dados pertencentes ao usuário.

## Testes
1. Oficial e não oficial contam no total, mas somente registros oficiais comprovadamente cobrados somam custo.
2. `unknown` aparece como “Não determinado” e soma zero.
3. Mensagem não oficial aparece com R$ 0,00.
4. Repetição do mesmo webhook não altera contagens nem custo.
5. Mesma mensagem vista nas duas fontes aparece uma vez.
6. Categoria e preço históricos não mudam quando a tabela vigente é atualizada.
7. Janela de 24 horas não muda conexão, canal nem status financeiro.
8. Filtros de hoje, 7 dias, 30 dias, mês e período personalizado respeitam `America/Sao_Paulo`.
9. Conexões não híbridas, envio, recebimento, automações e histórico permanecem inalterados.

## Limite de segurança
A implementação começará somente após aprovação. Antes de editar o ZapCRM, será necessário restabelecer acesso seguro à VPS para confirmar os nomes e formatos exatos das tabelas e serviços em produção. Se a estrutura real exigir mudança fora dessas áreas, o trabalho será interrompido para nova autorização.
