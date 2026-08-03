CREATE TABLE IF NOT EXISTS public.email_opens (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  owner_id uuid,
  recipient_email text,
  template_name text,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  open_count integer not null default 1,
  user_agent text
);

GRANT SELECT ON public.email_opens TO authenticated;
GRANT ALL ON public.email_opens TO service_role;

ALTER TABLE public.email_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their email opens"
ON public.email_opens FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_email_opens_owner ON public.email_opens(owner_id, last_opened_at DESC);

CREATE OR REPLACE FUNCTION public.get_email_tracking(_days integer DEFAULT 30, _limit integer DEFAULT 200)
RETURNS TABLE(
  message_id text,
  template_name text,
  recipient_email text,
  status text,
  error_message text,
  sent_at timestamptz,
  opened boolean,
  first_opened_at timestamptz,
  open_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (l.message_id)
      l.message_id, l.template_name, l.recipient_email, l.status, l.error_message, l.created_at, l.metadata
    FROM public.email_send_log l
    WHERE l.message_id IS NOT NULL
      AND l.created_at >= now() - make_interval(days => GREATEST(coalesce(_days,30), 1))
      AND (
        l.metadata->>'owner_id' = auth.uid()::text
        OR public.has_role(auth.uid(), 'admin')
      )
    ORDER BY l.message_id, l.created_at DESC
  )
  SELECT latest.message_id, latest.template_name, latest.recipient_email, latest.status,
         latest.error_message, latest.created_at,
         (o.id IS NOT NULL) AS opened, o.first_opened_at, coalesce(o.open_count, 0)
  FROM latest
  LEFT JOIN public.email_opens o ON o.message_id = latest.message_id
  ORDER BY latest.created_at DESC
  LIMIT GREATEST(coalesce(_limit, 200), 1);
$$;

REVOKE ALL ON FUNCTION public.get_email_tracking(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_tracking(integer, integer) TO authenticated;