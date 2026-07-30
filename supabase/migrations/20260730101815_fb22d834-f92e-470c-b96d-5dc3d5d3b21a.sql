ALTER TABLE public.vplay_servers
  ADD COLUMN IF NOT EXISTS server_type text NOT NULL DEFAULT 'vplay',
  ADD COLUMN IF NOT EXISTS api_key text,
  ADD COLUMN IF NOT EXISTS test_minutes integer NOT NULL DEFAULT 60;

ALTER TABLE public.vplay_servers ALTER COLUMN integration_url DROP NOT NULL;
ALTER TABLE public.vplay_servers ALTER COLUMN key_message DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vplay_servers_server_type_check'
  ) THEN
    ALTER TABLE public.vplay_servers
      ADD CONSTRAINT vplay_servers_server_type_check
      CHECK (server_type IN ('vplay', 'natv', 'natv2'));
  END IF;
END $$;