CREATE TABLE IF NOT EXISTS public.bot_test_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  panel text,
  test_username text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_test_generations_user_phone_idx ON public.bot_test_generations (user_id, phone, created_at DESC);
GRANT SELECT ON public.bot_test_generations TO authenticated;
GRANT ALL ON public.bot_test_generations TO service_role;
ALTER TABLE public.bot_test_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view their bot test generations"
  ON public.bot_test_generations FOR SELECT TO authenticated
  USING (user_id = auth.uid());