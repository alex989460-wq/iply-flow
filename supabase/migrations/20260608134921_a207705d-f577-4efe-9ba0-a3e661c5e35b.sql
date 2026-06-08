CREATE TABLE public.evolution_conversation_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  phone text NOT NULL,
  last_read_at timestamp with time zone,
  manual_unread boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_conversation_state TO authenticated;
GRANT ALL ON public.evolution_conversation_state TO service_role;

ALTER TABLE public.evolution_conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own evolution conversation state"
ON public.evolution_conversation_state
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_evolution_conversation_state_updated_at
BEFORE UPDATE ON public.evolution_conversation_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();