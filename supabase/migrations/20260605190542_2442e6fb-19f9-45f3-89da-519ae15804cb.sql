CREATE TABLE public.evolution_billing_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  send_time time NOT NULL DEFAULT '09:00:00',
  send_d_minus_1 boolean NOT NULL DEFAULT true,
  send_d0 boolean NOT NULL DEFAULT true,
  send_d_plus_1 boolean NOT NULL DEFAULT true,
  message_d_minus_1 text DEFAULT 'Olá {{nome}}, sua assinatura vence amanhã ({{vencimento}}). Renove para continuar usando! 📺',
  message_d0 text DEFAULT 'Olá {{nome}}, sua assinatura vence HOJE ({{vencimento}}). Renove agora! ⚠️',
  message_d_plus_1 text DEFAULT 'Olá {{nome}}, sua assinatura venceu ontem ({{vencimento}}). Regularize hoje! 🚨',
  min_delay_seconds integer NOT NULL DEFAULT 15,
  max_delay_seconds integer NOT NULL DEFAULT 30,
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_billing_schedule TO authenticated;
GRANT ALL ON public.evolution_billing_schedule TO service_role;

ALTER TABLE public.evolution_billing_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own evolution_billing_schedule"
  ON public.evolution_billing_schedule
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

CREATE TRIGGER update_evolution_billing_schedule_updated_at
  BEFORE UPDATE ON public.evolution_billing_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();