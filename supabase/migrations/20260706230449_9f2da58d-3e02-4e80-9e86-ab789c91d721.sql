CREATE UNIQUE INDEX IF NOT EXISTS ai_training_conversations_dedup_idx
ON public.ai_training_conversations (user_id, source, contact_phone, started_at, ended_at);