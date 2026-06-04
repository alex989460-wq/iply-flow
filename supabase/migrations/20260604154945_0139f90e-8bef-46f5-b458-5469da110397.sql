
CREATE TABLE public.evolution_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT false,
  base_url text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  instance_name text NOT NULL DEFAULT '',
  webhook_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_settings TO authenticated;
GRANT ALL ON public.evolution_settings TO service_role;
ALTER TABLE public.evolution_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own evolution_settings" ON public.evolution_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_evolution_settings_updated BEFORE UPDATE ON public.evolution_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.evolution_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  remote_jid text NOT NULL,
  phone text NOT NULL,
  contact_name text,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  external_id text,
  status text NOT NULL DEFAULT 'sent',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_evo_msg_user_phone ON public.evolution_messages(user_id, phone, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_messages TO authenticated;
GRANT ALL ON public.evolution_messages TO service_role;
ALTER TABLE public.evolution_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner views own evolution_messages" ON public.evolution_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner deletes own evolution_messages" ON public.evolution_messages
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service inserts evolution_messages" ON public.evolution_messages
  FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_messages;
ALTER TABLE public.evolution_messages REPLICA IDENTITY FULL;
