CREATE TABLE IF NOT EXISTS public.meta_template_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  language text NOT NULL,
  definition jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, language)
);
GRANT SELECT ON public.meta_template_cache TO authenticated;
GRANT ALL ON public.meta_template_cache TO service_role;
ALTER TABLE public.meta_template_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read template cache" ON public.meta_template_cache FOR SELECT TO authenticated USING (true);