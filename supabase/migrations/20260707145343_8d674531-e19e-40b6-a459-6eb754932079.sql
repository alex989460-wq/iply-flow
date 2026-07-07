CREATE INDEX IF NOT EXISTS idx_evolution_messages_user_created_at_id
ON public.evolution_messages (user_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_billing_logs_sent_date_status_customer
ON public.billing_logs (sent_date_br, whatsapp_status, customer_id);

CREATE INDEX IF NOT EXISTS idx_ai_training_conversations_user_pending_created
ON public.ai_training_conversations (user_id, created_at)
WHERE analyzed_at IS NULL;