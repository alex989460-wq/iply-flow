# Plano: Ativação Manual de Login Sigma (Bypass WAF)

O usuário deseja uma opção para ativar manualmente o login no painel Sigma quando houver bloqueios de firewall, similar ao que existe para o Uniplay (Ponte Sigma/Bridge). Embora a infraestrutura da ponte já exista no código, os controles de UI para gerar o token e o bookmarklet não estão visíveis ou acessíveis para o usuário nas configurações de API.

## Alterações Sugeridas

### Configurações de API (Frontend)
- **Arquivo**: `src/components/settings/ResellerApiSettings.tsx`
- **Ação**: Restaurar e melhorar a interface de gerenciamento da Ponte Sigma dentro de cada conexão Sigma cadastrada.
- **Detalhes**:
    - Adicionar um botão "Gerar Token da Ponte" para conexões que ainda não possuem um.
    - Exibir o bookmarklet (link arrastável) "Ativar Ponte Sigma" quando o token existir.
    - Adicionar um botão para "Remover Token da Ponte" (Desativar).
    - Garantir que o estado visual "Bridge Online" (baseado em `last_bridge_seen_at`) funcione corretamente para dar feedback ao usuário.

### Painel de Renovação Rápida (Frontend)
- **Arquivo**: `src/components/chat/QuickRenewalPanel.tsx`
- **Ação**: Melhorar a detecção de necessidade da ponte e o feedback.
- **Detalhes**:
    - Quando uma renovação Sigma falha por WAF (erro 403/bloqueio), informar claramente ao usuário que ele pode usar a Ponte Sigma configurada em "Configurações".
    - A Edge Function `sigma-renew` já possui lógica para tentar a ponte se o `connection_id` for enviado e a ponte estiver online.

### Edge Function Sigma Renew (Backend)
- **Arquivo**: `supabase/functions/sigma-renew/index.ts`
- **Ação**: Garantir que a lógica de "long polling" da ponte seja robusta.
- **Detalhes**:
    - Manter a lógica atual que verifica `bridge_token` e `last_bridge_seen_at` antes de enfileirar uma tarefa de ponte.

## Detalhes Técnicos

A Ponte Sigma funciona injetando um script via bookmarklet na aba aberta e logada do painel Sigma do revendedor. Esse script faz poll na Edge Function `sigma-bridge` por tarefas (como `renew_customer`) e as executa usando a sessão (cookies/localstorage) do navegador do usuário, enviando o resultado de volta. Isso contorna 100% de qualquer bloqueio de IP ou WAF do servidor Sigma.

```text
Usuário (Navegador) <---> Ponte (Bookmarklet no Sigma) <---> Edge Function (Fila de Jobs) <---> CRM Dashboard
```

Irei agora implementar a UI que falta para o usuário gerenciar isso.
