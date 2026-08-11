CREATE TABLE IF NOT EXISTS public.audit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_accounts TO authenticated;
GRANT ALL ON public.audit_accounts TO service_role;

ALTER TABLE public.audit_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auditor can view own audit row"
ON public.audit_accounts FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_audit_accounts_updated_at
BEFORE UPDATE ON public.audit_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_inactive_auditor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.audit_accounts WHERE user_id = auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.is_inactive_auditor() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_inactive_auditor() TO authenticated;

CREATE POLICY "Auditor can view long inactive customers"
ON public.customers FOR SELECT TO authenticated
USING (
  public.is_inactive_auditor()
  AND due_date IS NOT NULL
  AND due_date < (((now() AT TIME ZONE 'America/Sao_Paulo')::date) - 60)
);

CREATE POLICY "Auditor can view servers"
ON public.servers FOR SELECT TO authenticated
USING (public.is_inactive_auditor());

CREATE POLICY "Auditor can view plans"
ON public.plans FOR SELECT TO authenticated
USING (public.is_inactive_auditor());

CREATE POLICY "Auditor can view payments of long inactive customers"
ON public.payments FOR SELECT TO authenticated
USING (
  public.is_inactive_auditor()
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = payments.customer_id
      AND c.due_date IS NOT NULL
      AND c.due_date < (((now() AT TIME ZONE 'America/Sao_Paulo')::date) - 60)
  )
);