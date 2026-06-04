ALTER TABLE public.evolution_messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS profile_pic_url text;

CREATE TABLE IF NOT EXISTS public.evolution_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  name text,
  profile_pic_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_contacts TO authenticated;
GRANT ALL ON public.evolution_contacts TO service_role;

ALTER TABLE public.evolution_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'evolution_contacts'
      AND policyname = 'Users manage own evolution_contacts'
  ) THEN
    CREATE POLICY "Users manage own evolution_contacts"
      ON public.evolution_contacts
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_evolution_contacts_updated ON public.evolution_contacts;
CREATE TRIGGER trg_evolution_contacts_updated
  BEFORE UPDATE ON public.evolution_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_contacts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.evolution_contacts REPLICA IDENTITY FULL;