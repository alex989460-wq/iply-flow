CREATE TABLE public.evolution_billing_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  label text NOT NULL,
  days_offset integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  message text NOT NULL DEFAULT '',
  image_url text,
  button_enabled boolean NOT NULL DEFAULT false,
  button_label text,
  button_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_billing_rules TO authenticated;
GRANT ALL ON public.evolution_billing_rules TO service_role;

ALTER TABLE public.evolution_billing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own evolution billing rules"
ON public.evolution_billing_rules
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_evolution_billing_rules_updated_at
BEFORE UPDATE ON public.evolution_billing_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_evolution_billing_rules_user ON public.evolution_billing_rules(user_id, sort_order);