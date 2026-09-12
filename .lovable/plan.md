# Corrigir vencimento desatualizado em Clientes

## Objetivo
Garantir que a busca de clientes sempre consulte o vencimento mais recente, sem reaproveitar por minutos uma lista antiga no computador ou celular.

## Alterações
- Fazer a página Clientes atualizar os dados ao abrir e ao voltar para a aba.
- Manter filtros, pesquisa e paginação existentes.
- Validar o usuário `609952171` no site em uso e confirmar a data `12/10/2026`.
- Publicar a correção também no servidor dedicado, mantendo o ambiente atual ativo.

## Detalhes técnicos
- Ajustar somente a política de atualização da consulta de clientes; não alterar pagamentos, gatilhos ou datas no banco.
- Confirmar ausência de erros e testar a pesquisa no domínio `supergestor.top`.
