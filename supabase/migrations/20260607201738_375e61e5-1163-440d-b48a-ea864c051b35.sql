
-- Knowledge base entries for the chat AI
CREATE TABLE IF NOT EXISTS public.ai_knowledge_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outros',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  response_template TEXT NOT NULL,
  requires_human BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_entries TO authenticated;
GRANT ALL ON public.ai_knowledge_entries TO service_role;

ALTER TABLE public.ai_knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai_knowledge_entries"
ON public.ai_knowledge_entries
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ai_knowledge_entries_updated_at
BEFORE UPDATE ON public.ai_knowledge_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_ai_kb_user ON public.ai_knowledge_entries(user_id, sort_order);

-- Add classification columns on evolution_contacts
ALTER TABLE public.evolution_contacts
  ADD COLUMN IF NOT EXISTS ai_category TEXT,
  ADD COLUMN IF NOT EXISTS needs_human BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_classified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_evo_contacts_needs_human ON public.evolution_contacts(user_id, needs_human) WHERE needs_human = true;
