
-- Last seen tracking for online status
ALTER TABLE public.evolution_presence ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Allow service role updates on evolution_messages so webhook can set delivered/read status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evolution_messages' AND policyname='Service updates evolution_messages') THEN
    CREATE POLICY "Service updates evolution_messages"
      ON public.evolution_messages FOR UPDATE
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for evolution_messages updates
ALTER TABLE public.evolution_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_messages';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_presence';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
