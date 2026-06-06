
CREATE TABLE IF NOT EXISTS public.evolution_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  phone TEXT NOT NULL,
  presence TEXT NOT NULL DEFAULT 'available',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

GRANT SELECT ON public.evolution_presence TO authenticated;
GRANT ALL ON public.evolution_presence TO service_role;

ALTER TABLE public.evolution_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own presence" ON public.evolution_presence
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service manages presence" ON public.evolution_presence
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_presence;
ALTER TABLE public.evolution_presence REPLICA IDENTITY FULL;
