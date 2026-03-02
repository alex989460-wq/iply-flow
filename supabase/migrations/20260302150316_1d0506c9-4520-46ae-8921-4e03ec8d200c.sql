
-- Tabela para registrar todas as tentativas de envio de mensagem
CREATE TABLE public.message_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  message_type text NOT NULL DEFAULT 'confirmation',
  source text NOT NULL DEFAULT 'cakto',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  whatsapp_response jsonb,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index para consultas rápidas
CREATE INDEX idx_message_logs_created_at ON public.message_logs(created_at DESC);
CREATE INDEX idx_message_logs_user_id ON public.message_logs(user_id);
CREATE INDEX idx_message_logs_status ON public.message_logs(status);

-- Enable RLS
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all message_logs"
ON public.message_logs FOR SELECT
USING (is_admin());

CREATE POLICY "Service can insert message_logs"
ON public.message_logs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can delete message_logs"
ON public.message_logs FOR DELETE
USING (is_admin());
