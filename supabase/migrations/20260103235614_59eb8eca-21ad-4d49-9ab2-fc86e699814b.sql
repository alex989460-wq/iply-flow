-- Tabela para evitar reenvio de disparos (economia / anti-spam)
CREATE TABLE IF NOT EXISTS public.broadcast_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  phone_normalized text NOT NULL,
  template_name text NOT NULL,
  last_status text NOT NULL DEFAULT 'sent',
  last_error text NULL,
  last_sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_logs_phone_template_unique UNIQUE (phone_normalized, template_name)
);

ALTER TABLE public.broadcast_logs ENABLE ROW LEVEL SECURITY;

-- Função padrão para updated_at (idempotente)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_broadcast_logs_updated_at ON public.broadcast_logs;
CREATE TRIGGER update_broadcast_logs_updated_at
BEFORE UPDATE ON public.broadcast_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Políticas: somente admins
DROP POLICY IF EXISTS "Admins can view broadcast_logs" ON public.broadcast_logs;
CREATE POLICY "Admins can view broadcast_logs"
ON public.broadcast_logs
FOR SELECT
USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert broadcast_logs" ON public.broadcast_logs;
CREATE POLICY "Admins can insert broadcast_logs"
ON public.broadcast_logs
FOR INSERT
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update broadcast_logs" ON public.broadcast_logs;
CREATE POLICY "Admins can update broadcast_logs"
ON public.broadcast_logs
FOR UPDATE
USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete broadcast_logs" ON public.broadcast_logs;
CREATE POLICY "Admins can delete broadcast_logs"
ON public.broadcast_logs
FOR DELETE
USING (is_admin());

-- Índice para acelerar checagem por template
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_template_status
ON public.broadcast_logs (template_name, last_status);
