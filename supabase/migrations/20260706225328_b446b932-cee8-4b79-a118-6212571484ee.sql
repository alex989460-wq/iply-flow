
-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Conversations imported from message providers
CREATE TABLE public.ai_training_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('evolution','oficial')),
  contact_phone TEXT,
  contact_name TEXT,
  operator_id UUID,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  message_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'imported',
  tags TEXT[] DEFAULT '{}',
  outcome TEXT,
  raw JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_training_conversations_user_analyzed ON public.ai_training_conversations(user_id, analyzed_at);
CREATE INDEX ai_training_conversations_user_source ON public.ai_training_conversations(user_id, source);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_training_conversations TO authenticated;
GRANT ALL ON public.ai_training_conversations TO service_role;
ALTER TABLE public.ai_training_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conversations" ON public.ai_training_conversations FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Import / analysis job tracking
CREATE TABLE public.ai_training_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('import','analyze')),
  source TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  total INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_training_jobs_user ON public.ai_training_jobs(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_training_jobs TO authenticated;
GRANT ALL ON public.ai_training_jobs TO service_role;
ALTER TABLE public.ai_training_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own training jobs" ON public.ai_training_jobs FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Candidate knowledge awaiting admin approval
CREATE TABLE public.ai_knowledge_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  canonical_question TEXT NOT NULL,
  similar_questions TEXT[] DEFAULT '{}',
  best_answer TEXT NOT NULL,
  category TEXT DEFAULT 'outros',
  tags TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  confidence NUMERIC DEFAULT 0.5,
  usage_count INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','merged')),
  source_conversation_ids UUID[] DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_knowledge_candidates_user_status ON public.ai_knowledge_candidates(user_id, status);
CREATE INDEX ai_knowledge_candidates_embedding ON public.ai_knowledge_candidates USING hnsw (embedding vector_cosine_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_candidates TO authenticated;
GRANT ALL ON public.ai_knowledge_candidates TO service_role;
ALTER TABLE public.ai_knowledge_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own candidates" ON public.ai_knowledge_candidates FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Add embedding column to existing knowledge entries (approved responses used by bot)
ALTER TABLE public.ai_knowledge_entries
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS canonical_question TEXT,
  ADD COLUMN IF NOT EXISTS success_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS ai_knowledge_entries_embedding
  ON public.ai_knowledge_entries USING hnsw (embedding vector_cosine_ops);

-- Updated_at triggers
CREATE TRIGGER trg_ai_training_conversations_updated
  BEFORE UPDATE ON public.ai_training_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_ai_knowledge_candidates_updated
  BEFORE UPDATE ON public.ai_knowledge_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semantic search helper for candidates dedupe
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_candidates(
  _user_id UUID,
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.86,
  match_count INT DEFAULT 3
)
RETURNS TABLE (id UUID, canonical_question TEXT, similarity FLOAT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.canonical_question, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.ai_knowledge_candidates c
  WHERE c.user_id = _user_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Semantic search over approved knowledge for the bot
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_entries(
  _user_id UUID,
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.82,
  match_count INT DEFAULT 1
)
RETURNS TABLE (
  id UUID, title TEXT, category TEXT, response_template TEXT,
  media_url TEXT, media_mime TEXT, media_type TEXT, media_filename TEXT,
  requires_human BOOLEAN, similarity FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.title, e.category, e.response_template,
         e.media_url, e.media_mime, e.media_type, e.media_filename,
         e.requires_human,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.ai_knowledge_entries e
  WHERE e.user_id = _user_id
    AND e.is_enabled = true
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) >= match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
