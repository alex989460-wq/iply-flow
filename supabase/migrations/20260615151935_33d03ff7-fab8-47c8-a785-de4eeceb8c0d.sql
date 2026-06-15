CREATE TABLE public.bot_flow_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  flow_id UUID NOT NULL REFERENCES public.bot_flows(id) ON DELETE CASCADE,
  current_step_id TEXT,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(owner_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_flow_sessions TO authenticated;
GRANT ALL ON public.bot_flow_sessions TO service_role;

ALTER TABLE public.bot_flow_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bot flow sessions"
ON public.bot_flow_sessions
FOR ALL
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE INDEX bot_flow_sessions_owner_phone_idx ON public.bot_flow_sessions(owner_id, phone);
CREATE INDEX bot_flow_sessions_expires_idx ON public.bot_flow_sessions(expires_at);

CREATE TRIGGER trg_bot_flow_sessions_updated
BEFORE UPDATE ON public.bot_flow_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();