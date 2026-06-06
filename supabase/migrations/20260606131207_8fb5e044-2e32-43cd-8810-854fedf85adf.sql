ALTER TABLE public.user_evolution_instances
ADD COLUMN IF NOT EXISTS advanced_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS webhook_events text[] NOT NULL DEFAULT ARRAY['MESSAGE','SEND_MESSAGE','CONNECTION','PRESENCE','CHAT_PRESENCE']::text[],
ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS settings_updated_at timestamp with time zone;