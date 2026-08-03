-- Adiciona configurações de automação de IA para revendedores
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS ai_automation_enabled boolean DEFAULT false;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'gemini';
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS ai_api_key text;

-- Remove a restrição singleton se ela existir para permitir por usuário
ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_singleton_key;
ALTER TABLE public.platform_settings DROP COLUMN IF EXISTS singleton;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'platform_settings' AND rowsecurity = true) THEN
        ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

DROP POLICY IF EXISTS "Users can manage their own platform settings" ON public.platform_settings;
CREATE POLICY "Users can manage their own platform settings" ON public.platform_settings
    FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Garante permissões na tabela de knowledge items
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_items TO authenticated;
GRANT ALL ON public.ai_knowledge_items TO service_role;

-- Cria tabela para mapear intenções da IA
CREATE TABLE IF NOT EXISTS public.ai_automation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    intent_name text NOT NULL,
    action_type text NOT NULL,
    action_config jsonb DEFAULT '{}'::jsonb,
    is_enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_automation_rules TO authenticated;
GRANT ALL ON public.ai_automation_rules TO service_role;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ai_automation_rules' AND rowsecurity = true) THEN
        ALTER TABLE public.ai_automation_rules ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

DROP POLICY IF EXISTS "Users can manage their own AI rules" ON public.ai_automation_rules;
CREATE POLICY "Users can manage their own AI rules" ON public.ai_automation_rules
    FOR ALL TO authenticated USING (auth.uid() = user_id);
