-- ============================================================
-- SUPER GESTOR — REPARO DE ACESSOS APÓS INSTALAÇÃO/MIGRAÇÃO
-- ============================================================
-- Use este script quando o sistema abre, mas o email admin ou os
-- revendedores não conseguem acessar/visualizar seus dados.
--
-- IMPORTANTE:
-- 1) Este script NÃO cria usuários de login. Os emails precisam existir
--    primeiro no Auth do novo projeto.
-- 2) Crie/cadastre os usuários com os MESMOS emails usados no sistema antigo.
-- 3) Depois edite as variáveis abaixo e execute este SQL.
-- ============================================================

-- 1) Informe aqui o email do administrador principal
DO $$
DECLARE
  admin_email text := 'SEU_EMAIL_ADMIN_AQUI';
  admin_user_id uuid;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE lower(email) = lower(admin_email)
  LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin não encontrado em auth.users. Primeiro crie/cadastre o usuário com o email: %', admin_email;
  END IF;

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (admin_user_id, split_part(admin_email, '@', 1))
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (admin_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.reseller_access (user_id, email, full_name, access_expires_at, is_active, credits)
  VALUES (admin_user_id, admin_email, split_part(admin_email, '@', 1), now() + interval '10 years', true, 999999)
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      is_active = true,
      access_expires_at = GREATEST(public.reseller_access.access_expires_at, EXCLUDED.access_expires_at),
      credits = GREATEST(public.reseller_access.credits, EXCLUDED.credits);
END $$;

-- 2) Opcional: informe aqui emails de revendedores que já foram criados no Auth.
--    Adicione/remova linhas do VALUES conforme necessário.
WITH reseller_emails(email, full_name, credits, days_valid) AS (
  VALUES
    -- ('revendedor1@email.com', 'Revendedor 1', 0, 365),
    -- ('revendedor2@email.com', 'Revendedor 2', 0, 365)
    ('remova-esta-linha@exemplo.com', 'REMOVER ESTA LINHA', 0, 1)
), valid_resellers AS (
  SELECT u.id AS user_id, r.email, r.full_name, r.credits, r.days_valid
  FROM reseller_emails r
  JOIN auth.users u ON lower(u.email) = lower(r.email)
  WHERE r.email <> 'remova-esta-linha@exemplo.com'
)
INSERT INTO public.profiles (user_id, full_name)
SELECT user_id, full_name
FROM valid_resellers
ON CONFLICT (user_id) DO UPDATE
SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

WITH reseller_emails(email, full_name, credits, days_valid) AS (
  VALUES
    -- ('revendedor1@email.com', 'Revendedor 1', 0, 365),
    -- ('revendedor2@email.com', 'Revendedor 2', 0, 365)
    ('remova-esta-linha@exemplo.com', 'REMOVER ESTA LINHA', 0, 1)
), valid_resellers AS (
  SELECT u.id AS user_id, r.email, r.full_name, r.credits, r.days_valid
  FROM reseller_emails r
  JOIN auth.users u ON lower(u.email) = lower(r.email)
  WHERE r.email <> 'remova-esta-linha@exemplo.com'
)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'user'::public.app_role
FROM valid_resellers
ON CONFLICT (user_id, role) DO NOTHING;

WITH reseller_emails(email, full_name, credits, days_valid) AS (
  VALUES
    -- ('revendedor1@email.com', 'Revendedor 1', 0, 365),
    -- ('revendedor2@email.com', 'Revendedor 2', 0, 365)
    ('remova-esta-linha@exemplo.com', 'REMOVER ESTA LINHA', 0, 1)
), valid_resellers AS (
  SELECT u.id AS user_id, r.email, r.full_name, r.credits, r.days_valid
  FROM reseller_emails r
  JOIN auth.users u ON lower(u.email) = lower(r.email)
  WHERE r.email <> 'remova-esta-linha@exemplo.com'
)
INSERT INTO public.reseller_access (user_id, email, full_name, access_expires_at, is_active, credits)
SELECT user_id, email, full_name, now() + (days_valid || ' days')::interval, true, credits
FROM valid_resellers
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = true,
    access_expires_at = GREATEST(public.reseller_access.access_expires_at, EXCLUDED.access_expires_at),
    credits = GREATEST(public.reseller_access.credits, EXCLUDED.credits);

-- 3) Conferência final: deve listar admin/revendedores existentes no Auth
--    com seus perfis, roles e validade de acesso.
SELECT
  u.email,
  p.full_name AS profile_name,
  array_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL) AS roles,
  ra.is_active,
  ra.access_expires_at,
  ra.credits
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.reseller_access ra ON ra.user_id = u.id
GROUP BY u.email, p.full_name, ra.is_active, ra.access_expires_at, ra.credits
ORDER BY u.email;