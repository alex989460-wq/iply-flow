
CREATE TABLE IF NOT EXISTS public.user_evolution_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instance_name text NOT NULL,
  instance_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_evolution_instances TO authenticated;
GRANT ALL ON public.user_evolution_instances TO service_role;

ALTER TABLE public.user_evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own evo instances"
  ON public.user_evolution_instances FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users insert own evo instances"
  ON public.user_evolution_instances FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users delete own evo instances"
  ON public.user_evolution_instances FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins update evo instances"
  ON public.user_evolution_instances FOR UPDATE
  USING (public.is_admin());

ALTER TABLE public.reseller_access
  ADD COLUMN IF NOT EXISTS max_evolution_instances integer NOT NULL DEFAULT 1;

-- Admins can update max_evolution_instances for any reseller_access row
DROP POLICY IF EXISTS "Admins can manage reseller_access limits" ON public.reseller_access;
CREATE POLICY "Admins can manage reseller_access limits"
  ON public.reseller_access FOR UPDATE
  USING (public.is_admin());
