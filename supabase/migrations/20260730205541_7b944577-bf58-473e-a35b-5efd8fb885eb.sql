CREATE TABLE public.playlist_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  playlist_name text NOT NULL DEFAULT 'MINHA TV',
  m3u_url_template text NOT NULL,
  epg_url_template text,
  default_host text,
  send_tv boolean NOT NULL DEFAULT true,
  send_vod boolean NOT NULL DEFAULT true,
  pin text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_templates TO authenticated;
GRANT ALL ON public.playlist_templates TO service_role;

ALTER TABLE public.playlist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own playlist templates"
ON public.playlist_templates FOR ALL TO authenticated
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE INDEX idx_playlist_templates_user ON public.playlist_templates(user_id);

CREATE TRIGGER update_playlist_templates_updated_at
BEFORE UPDATE ON public.playlist_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();