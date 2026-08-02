ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers (created_by, email);

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS use_email_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_from_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_reply_to text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_subject text DEFAULT 'Sua assinatura vence em breve',
  ADD COLUMN IF NOT EXISTS email_msg_d_minus_1 text DEFAULT 'Olá {{nome}}, sua assinatura vence amanhã ({{vencimento}}). Valor: {{valor}}.',
  ADD COLUMN IF NOT EXISTS email_msg_d0 text DEFAULT 'Olá {{nome}}, sua assinatura vence hoje ({{vencimento}}). Valor: {{valor}}.',
  ADD COLUMN IF NOT EXISTS email_msg_d_plus_1 text DEFAULT 'Olá {{nome}}, sua assinatura venceu em {{vencimento}}. Regularize para evitar bloqueio. Valor: {{valor}}.';

-- Backfill de e-mails vindos das ativações (casamento por telefone, dentro do mesmo revendedor)
WITH src AS (
  SELECT ar.user_id AS owner_id,
         right(regexp_replace(ar.customer_phone, '\D', '', 'g'), 9) AS p9,
         lower(trim(ar.email)) AS email,
         ar.created_at
  FROM public.activation_requests ar
  WHERE ar.email IS NOT NULL AND ar.email <> '' AND ar.email LIKE '%@%'
    AND ar.customer_phone IS NOT NULL
),
ranked AS (
  SELECT DISTINCT ON (owner_id, p9) owner_id, p9, email
  FROM src WHERE length(p9) = 9
  ORDER BY owner_id, p9, created_at DESC
)
UPDATE public.customers c
SET email = r.email
FROM ranked r
WHERE c.created_by = r.owner_id
  AND right(regexp_replace(c.phone, '\D', '', 'g'), 9) = r.p9
  AND (c.email IS NULL OR c.email = '');

WITH src2 AS (
  SELECT right(regexp_replace(p.phone_normalized, '\D', '', 'g'), 9) AS p9,
         lower(trim(p.email)) AS email,
         p.created_at
  FROM public.pending_activation_data p
  WHERE p.email IS NOT NULL AND p.email <> '' AND p.email LIKE '%@%'
),
ranked2 AS (
  SELECT DISTINCT ON (p9) p9, email FROM src2 WHERE length(p9) = 9
  ORDER BY p9, created_at DESC
)
UPDATE public.customers c
SET email = r.email
FROM ranked2 r
WHERE right(regexp_replace(c.phone, '\D', '', 'g'), 9) = r.p9
  AND (c.email IS NULL OR c.email = '');