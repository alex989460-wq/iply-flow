GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals_settings TO authenticated;
GRANT ALL ON public.goals_settings TO service_role;
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals_settings;
CREATE POLICY "Users can update own goals" ON public.goals_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);