CREATE TABLE IF NOT EXISTS public.customer_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  backup_data jsonb NOT NULL,
  total_customers integer NOT NULL DEFAULT 0,
  backup_type text NOT NULL DEFAULT 'auto'
);

ALTER TABLE public.customer_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage backups" ON public.customer_backups
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.cleanup_old_backups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.customer_backups
  WHERE id NOT IN (
    SELECT id FROM public.customer_backups
    ORDER BY created_at DESC
    LIMIT 144
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cleanup_backups
AFTER INSERT ON public.customer_backups
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_backups();