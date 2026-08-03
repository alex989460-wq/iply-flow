-- Adiciona configurações de automação de IA para revendedores
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS ai_automation_enabled boolean DEFAULT false;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'gemini'; -- 'gemini' | 'openai'
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS ai_api_key text;

-- Garante permissões na tabela de knowledge items (usada pelo AiTraining)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_items TO authenticated;
GRANT ALL ON public.ai_knowledge_items TO service_role;

-- Cria tabela para mapear intenções da IA para ações do sistema (opcional, para o futuro)
CREATE TABLE IF NOT EXISTS public.ai_automation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    intent_name text NOT NULL,
    action_type text NOT NULL, -- 'send_playlist', 'renew_customer', 'human_support'
    action_config jsonb DEFAULT '{}'::jsonb,
    is_enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_automation_rules TO authenticated;
GRANT ALL ON public.ai_automation_rules TO service_role;
ALTER TABLE public.ai_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own AI rules" ON public.ai_automation_rules
    FOR ALL TO authenticated USING (auth.uid() = user_id);
