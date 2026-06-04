CREATE UNIQUE INDEX IF NOT EXISTS idx_evolution_messages_user_external_unique
ON public.evolution_messages(user_id, external_id)
WHERE external_id IS NOT NULL;