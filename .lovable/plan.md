# Corrigir e melhorar a sincronização de senhas

## Objetivo
Fazer a sincronização em lote usar os mesmos caminhos que já funcionam ao puxar uma senha individual, permitir escolher exatamente quais servidores serão consultados e garantir que o VPlay apareça.

## Alterações
- Adicionar uma lista de seleção dos painéis/servidores disponíveis, com opção de marcar um ou vários antes de sincronizar.
- Incluir VPlay quando houver acesso pelo painel ou servidor VPlay cadastrado, não apenas quando o banco MySQL estiver preenchido.
- Trocar a listagem genérica do NATV por sincronização dos clientes locais selecionados, consultando cada usuário pelo mesmo método individual que já funciona; manter o filtro “somente ativos”.
- Fazer a mesma estratégia de consulta individual servir como fallback quando um painel não oferece listagem completa.
- Reaproveitar e validar a sessão salva do Uniplay antes de pedir novo reCAPTCHA; quando expirada, usar o fluxo de navegador já disponível na VPS em vez de apenas retornar a mensagem do 2Captcha.
- Mostrar progresso por servidor e por cliente, com resultados e erros claros sem cortar a mensagem importante.

## Detalhes técnicos
- A chamada receberá os painéis escolhidos e consultará somente clientes vinculados ao tipo de servidor correspondente.
- NATV/NATV² usarão `natvFindUserRaw` por usuário, evitando os endpoints `/users` que retornam 404.
- VPlay aceitará a configuração já usada pelo teste/renovação e terá fallback compatível com os servidores cadastrados.
- A função será atualizada no Cloud e na VPS; depois o painel será reconstruído e validado no `supergestor.top`.
