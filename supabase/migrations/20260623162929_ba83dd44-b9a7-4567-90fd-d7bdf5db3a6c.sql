CREATE TABLE IF NOT EXISTS public.crm_oficial_billing_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT false,
  send_time time NOT NULL DEFAULT '09:00',
  send_d_minus_1 boolean NOT NULL DEFAULT true,
  send_d0 boolean NOT NULL DEFAULT true,
  send_d_plus_1 boolean NOT NULL DEFAULT true,
  message_d_minus_1 text NOT NULL DEFAULT 'Olá {{nome}}, sua mensalidade vence amanhã ({{vencimento}}). Valor: {{valor}}.',
  message_d0 text NOT NULL DEFAULT 'Olá {{nome}}, sua mensalidade vence hoje ({{vencimento}}). Valor: {{valor}}.',
  message_d_plus_1 text NOT NULL DEFAULT 'Olá {{nome}}, sua mensalidade venceu ontem ({{vencimento}}). Regularize hoje para evitar bloqueio.',
  min_delay_seconds integer NOT NULL DEFAULT 15,
  max_delay_seconds integer NOT NULL DEFAULT 30,
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_oficial_billing_schedule TO authenticated;
GRANT ALL ON public.crm_oficial_billing_schedule TO service_role;

ALTER TABLE public.crm_oficial_billing_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own crm billing schedule"
  ON public.crm_oficial_billing_schedule
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_crm_oficial_billing_schedule_updated_at
  BEFORE UPDATE ON public.crm_oficial_billing_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();