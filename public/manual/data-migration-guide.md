# Migração de dados e acessos — Super Gestor

Este guia resolve o cenário em que a instalação do banco foi concluída, mas os clientes, planos, servidores, revendedores e o login antigo não aparecem no novo ambiente.

## Ponto crítico

O arquivo `schema.sql` instala somente a **estrutura** do sistema: tabelas, funções, triggers, políticas e buckets. Ele não carrega automaticamente:

- clientes antigos;
- planos, servidores e configurações antigas;
- arquivos de storage;
- usuários de login do Auth;
- senhas antigas;
- vínculo entre clientes e o novo `user_id` dos revendedores.

Por segurança, usuários e senhas do Auth não são copiados com um script SQL comum. Cada admin/revendedor precisa existir no Auth do novo projeto, normalmente recriando a conta com o mesmo email ou usando convite/reset de senha.

## Ordem correta de migração

1. Execute `schema.sql` no banco novo.
2. Crie/cadastre o admin no Auth com o mesmo email usado antes.
3. Execute `access-repair.sql`, informando o email do admin.
4. Crie/cadastre os revendedores no Auth com os mesmos emails antigos.
5. Execute novamente `access-repair.sql`, preenchendo a lista de revendedores.
6. Exporte os dados do banco antigo em CSV ou SQL por tabela.
7. Importe primeiro tabelas sem dependência e depois tabelas dependentes.
8. Reatribua as colunas de dono (`user_id`, `created_by`, `owner_id`) para o novo UUID de cada revendedor.
9. Confira contagens e faça login com admin e revendedores.

## Tabelas principais que normalmente precisam migrar

### Base comercial

- `plans`
- `servers`
- `customers`
- `payments`
- `expenses`
- `goals_settings`

### Acessos e revendedores

- `profiles`
- `user_roles`
- `reseller_access`
- `reseller_access_codes`
- `reseller_api_settings`
- `reseller_checkout_settings`

### Cobranças e WhatsApp

- `billing_settings`
- `billing_schedule`
- `billing_logs`
- `crm_oficial_settings`
- `zap_responder_settings`
- `evolution_settings`
- `user_evolution_instances`
- `evolution_contacts`
- `evolution_messages`
- `message_logs`

### Checkout, Pix e ativações

- `efi_settings`
- `efi_charges`
- `activation_apps`
- `activation_panel_credentials`
- `activation_requests`
- `pending_new_customers`
- `pending_manual_renewals`

## Colunas que vinculam dados ao revendedor

Ao migrar para outro Auth, o UUID do usuário pode mudar. Então os dados antigos só aparecem para o dono correto se essas colunas apontarem para o novo `auth.users.id`:

- `user_id`
- `created_by`
- `owner_id`
- `parent_reseller_id`
- `used_by`
- `approved_by`

Se você importar os clientes com `created_by` apontando para um UUID antigo que não existe no novo Auth, o admin/revendedor não verá esses clientes por causa das regras de segurança.

## Como fazer o mapeamento de emails para novos UUIDs

Depois de criar os usuários no novo Auth, rode:

```sql
SELECT id, email
FROM auth.users
ORDER BY email;
```

Monte uma planilha com:

| email | old_user_id | new_user_id |
|---|---|---|
| admin@empresa.com | UUID antigo | UUID novo |
| revendedor@empresa.com | UUID antigo | UUID novo |

Use essa planilha para substituir os campos de dono antes/depois da importação.

## Checklist de validação

Execute no banco novo:

```sql
SELECT COUNT(*) AS clientes FROM public.customers;
SELECT COUNT(*) AS planos FROM public.plans;
SELECT COUNT(*) AS servidores FROM public.servers;
SELECT COUNT(*) AS revendedores FROM public.reseller_access;

SELECT
  u.email,
  p.full_name,
  array_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL) AS roles,
  ra.is_active,
  ra.access_expires_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.reseller_access ra ON ra.user_id = u.id
GROUP BY u.email, p.full_name, ra.is_active, ra.access_expires_at
ORDER BY u.email;
```

Se a contagem de clientes estiver correta, mas eles não aparecem no sistema, o problema quase sempre é vínculo de dono (`created_by`, `user_id` ou `owner_id`) apontando para UUID antigo.

## Correção rápida para ambiente de dono único

Use apenas se todos os dados importados pertencem ao admin principal:

```sql
DO $$
DECLARE
  novo_admin uuid;
BEGIN
  SELECT id INTO novo_admin
  FROM auth.users
  WHERE lower(email) = lower('SEU_EMAIL_ADMIN_AQUI')
  LIMIT 1;

  IF novo_admin IS NULL THEN
    RAISE EXCEPTION 'Admin não encontrado no Auth';
  END IF;

  UPDATE public.customers SET created_by = novo_admin WHERE created_by IS NULL OR created_by NOT IN (SELECT id FROM auth.users);
  UPDATE public.plans SET created_by = novo_admin WHERE created_by IS NULL OR created_by NOT IN (SELECT id FROM auth.users);
  UPDATE public.servers SET created_by = novo_admin WHERE created_by IS NULL OR created_by NOT IN (SELECT id FROM auth.users);
  UPDATE public.billing_settings SET user_id = novo_admin WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users);
  UPDATE public.reseller_checkout_settings SET user_id = novo_admin WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users);
END $$;
```

Não use essa correção se você tem vários revendedores com clientes separados, porque ela colocará todos os dados sob o admin.