
-- Enum de tipos de conhecimento
DO $$ BEGIN
  CREATE TYPE public.ai_knowledge_kind AS ENUM (
    'procedure','flow','intent','official_answer','business_rule','tutorial'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_knowledge_item_status AS ENUM (
    'pending','approved','rejected','merged'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enriquecimento em ai_training_conversations
ALTER TABLE public.ai_training_conversations
  ADD COLUMN IF NOT EXISTS problem_summary text,
  ADD COLUMN IF NOT EXISTS solution_summary text,
  ADD COLUMN IF NOT EXISTS resolved boolean,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS app text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS signal_quality text,
  ADD COLUMN IF NOT EXISTS operator_name text,
  ADD COLUMN IF NOT EXISTS analysis_version int DEFAULT 2;

-- Nova tabela principal
CREATE TABLE IF NOT EXISTS public.ai_knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.ai_knowledge_kind NOT NULL,
  subject text NOT NULL,
  problem text,
  solution text,
  steps jsonb DEFAULT '[]'::jsonb,
  flow_nodes jsonb DEFAULT '[]'::jsonb,
  category text NOT NULL DEFAULT 'outros',
  devices text[] NOT NULL DEFAULT '{}',
  apps text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  usage_count int NOT NULL DEFAULT 1,
  resolved_count int NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0.4,
  last_used_at timestamptz,
  operators jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_conversation_ids uuid[] NOT NULL DEFAULT '{}',
  status public.ai_knowledge_item_status NOT NULL DEFAULT 'pending',
  merged_into_id uuid REFERENCES public.ai_knowledge_items(id) ON DELETE SET NULL,
  embedding vector(1536),
  approved_at timestamptz,
  approved_by uuid,
  knowledge_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_items TO authenticated;
GRANT ALL ON public.ai_knowledge_items TO service_role;

ALTER TABLE public.ai_knowledge_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own ai_knowledge_items" ON public.ai_knowledge_items;
CREATE POLICY "Users manage own ai_knowledge_items"
  ON public.ai_knowledge_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_ki_user_status ON public.ai_knowledge_items(user_id, status, kind);
CREATE INDEX IF NOT EXISTS idx_ai_ki_usage ON public.ai_knowledge_items(user_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS ai_ki_embedding_idx ON public.ai_knowledge_items USING hnsw (embedding vector_cosine_ops);

DROP TRIGGER IF EXISTS ai_ki_updated_at ON public.ai_knowledge_items;
CREATE TRIGGER ai_ki_updated_at BEFORE UPDATE ON public.ai_knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC de similaridade por tipo+categoria
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_items(
  _user_id uuid,
  _kind public.ai_knowledge_kind,
  _category text,
  query_embedding vector,
  match_threshold double precision DEFAULT 0.86,
  match_count int DEFAULT 1
) RETURNS TABLE(id uuid, subject text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.subject, 1 - (i.embedding <=> query_embedding) AS similarity
  FROM public.ai_knowledge_items i
  WHERE i.user_id = _user_id
    AND i.kind = _kind
    AND (i.category = _category OR _category IS NULL)
    AND i.status IN ('pending','approved')
    AND i.embedding IS NOT NULL
    AND 1 - (i.embedding <=> query_embedding) >= match_threshold
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
$$;
