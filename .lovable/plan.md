# Ponte Sigma sem extensão

Implementar uma ponte gratuita que roda na própria aba autenticada do painel Sigma. As chamadas saem do navegador e do IP do revendedor, evitando o bloqueio aplicado aos servidores em nuvem, sem proxy público e sem armazenar a sessão do Sigma no backend.

## Funcionamento

1. Em **Configurações → APIs → Sigma**, o revendedor gera uma chave individual da ponte.
2. O sistema fornece um favorito executável (“Ativar Ponte Sigma”) para salvar no navegador.
3. Com o painel Sigma aberto e autenticado, o revendedor clica nesse favorito uma vez.
4. A ponte mantém a aba ativa, consulta tarefas pendentes e executa teste, listagem, geração de teste e renovação usando a sessão real do painel.
5. O SuperGestor recebe o resultado e atualiza a interface normalmente.

## Backend e segurança

- Criar uma fila `sigma_bridge_jobs` isolada por revendedor, com RLS, grants explícitos, expiração e estados `pending`, `processing`, `completed` e `failed`.
- Criar a função `sigma-bridge` para entregar e concluir tarefas; autenticar cada ponte com token HMAC individual e limitar cada tarefa ao proprietário.
- Nunca enviar usuário/senha do Sigma pela fila: a ponte usa somente a sessão já autenticada na aba do painel.
- Validar ações e payloads permitidos; bloquear URLs arbitrárias, redirecionamentos externos e acesso entre revendedores.
- Aplicar trava de processamento para impedir que duas abas renovem o mesmo cliente.

## Integração Sigma

- Atualizar `sigma-renew` para tentar a API direta primeiro e, quando identificar bloqueio de WAF, encaminhar a operação para a ponte.
- Suportar as ações atuais: testar conexão, listar servidores/pacotes, gerar teste e renovar cliente.
- Para chamadas interativas, aguardar brevemente o resultado da ponte e devolver uma mensagem em português se a aba Sigma estiver fechada ou desconectada.
- Para renovações automáticas, manter a tarefa pendente para processamento assim que a ponte estiver online, sem duplicar a renovação.

## Interface

- Adicionar ao card Sigma o status da ponte: conectada, desconectada ou sessão expirada.
- Adicionar controles para copiar/instalar o favorito, testar a ponte e revogar a chave.
- Exibir instruções curtas: abrir o painel Sigma, fazer login e clicar no favorito.
- Preservar as múltiplas conexões Sigma já existentes.

## Verificação

- Validar isolamento entre revendedores e rejeição de tokens inválidos.
- Testar duas abas simultâneas para confirmar a trava antirrenovação duplicada.
- Testar conexão, servidores, geração de teste e renovação através da ponte.
- Confirmar mensagens em português para aba fechada, sessão expirada, usuário inexistente e erro do painel.

## Limite técnico

A ponte precisa de uma aba Sigma autenticada aberta, pois esse é o único meio gratuito de usar uma origem aceita pelo firewall sem extensão, proxy residencial pago ou liberação de IP pelo proprietário do painel.