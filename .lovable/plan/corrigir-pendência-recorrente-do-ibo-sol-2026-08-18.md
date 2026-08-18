# Corrigir pendência recorrente do IBO Sol

## Objetivo
Parar definitivamente a notificação antiga de “Sessão IBO Sol expirada” e alinhar a verificação automática ao login atual por e-mail e senha.

## Alterações
- Atualizar o `ibosol-keepalive` para usar o mesmo fluxo moderno do `ibosol-login`, em vez do login legado que tenta renovar o Bearer token diretamente.
- Não criar mais pendência manual apenas porque o token expirou quando o login automático por e-mail e senha está configurado.
- Quando a reconexão funcionar, apagar automaticamente qualquer pendência antiga `ibosol_session_expired` daquele revendedor.
- Quando o login automático realmente falhar, registrar o erro real de conexão/credenciais sem repetir notificações; manter somente uma pendência atual por revendedor.
- Limpar as pendências antigas desse tipo que já estejam gravadas no banco.
- Ajustar os textos de erro da ativação para orientar sobre a conexão por e-mail e senha, sem tratar o token como configuração manual.

## Validação
- Confirmar que o banco fica sem pendências antigas do IBO Sol.
- Executar o keepalive e verificar que ele não recria a notificação quando a conexão automática está válida.
- Verificar que uma falha real gera no máximo uma pendência e que uma reconexão posterior a remove.

## Detalhes técnicos
Arquivos principais: funções `ibosol-keepalive`, `ibosol-login` e `ibosol-activate`; dados em `pending_manual_renewals` e `activation_panel_credentials`.
