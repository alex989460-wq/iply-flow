
-- Add notification phone and custom renewal message template to billing_settings
ALTER TABLE public.billing_settings
  ADD COLUMN notification_phone text DEFAULT '',
  ADD COLUMN renewal_message_template text DEFAULT '✅ Olá, *{{nome}}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:

==========================
📅 Próx. Vencimento: *{{vencimento}} - {{hora}} hrs*
💰 Valor: *{{valor}}*
👤 Usuário: *{{usuario}}*
📦 Plano: *{{plano}}*
🔌 Status: *Ativo*
💎 Obs: -
⚡: *{{servidor}}*
==========================';
