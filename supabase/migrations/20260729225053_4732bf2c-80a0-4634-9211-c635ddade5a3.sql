CREATE TABLE public.tutorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Geral',
  video_url text,
  thumbnail_url text,
  duration_seconds integer,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutorials TO authenticated;
GRANT ALL ON public.tutorials TO service_role;

ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view published tutorials"
ON public.tutorials FOR SELECT TO authenticated
USING (is_published OR public.is_admin());

CREATE POLICY "Admins can insert tutorials"
ON public.tutorials FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update tutorials"
ON public.tutorials FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete tutorials"
ON public.tutorials FOR DELETE TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_tutorials_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_tutorials_updated_at
BEFORE UPDATE ON public.tutorials
FOR EACH ROW EXECUTE FUNCTION public.set_tutorials_updated_at();