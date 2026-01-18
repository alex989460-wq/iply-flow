-- Adicionar coluna user_id para vincular configurações ao usuário
ALTER TABLE public.zap_responder_settings 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Adicionar coluna para armazenar o token da API do usuário
ALTER TABLE public.zap_responder_settings 
ADD COLUMN IF NOT EXISTS zap_api_token text;

-- Criar índice único para garantir uma configuração por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_zap_responder_settings_user_id 
ON public.zap_responder_settings(user_id) WHERE user_id IS NOT NULL;

-- Atualizar políticas RLS para permitir que usuários vejam suas próprias configurações
DROP POLICY IF EXISTS "Admins can view zap_responder_settings" ON public.zap_responder_settings;
DROP POLICY IF EXISTS "Admins can insert zap_responder_settings" ON public.zap_responder_settings;
DROP POLICY IF EXISTS "Admins can update zap_responder_settings" ON public.zap_responder_settings;

-- Permitir que usuários vejam suas próprias configurações
CREATE POLICY "Users can view own zap_responder_settings" 
ON public.zap_responder_settings 
FOR SELECT 
USING (auth.uid() = user_id OR is_admin());

-- Permitir que usuários criem suas próprias configurações
CREATE POLICY "Users can insert own zap_responder_settings" 
ON public.zap_responder_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR is_admin());

-- Permitir que usuários atualizem suas próprias configurações
CREATE POLICY "Users can update own zap_responder_settings" 
ON public.zap_responder_settings 
FOR UPDATE 
USING (auth.uid() = user_id OR is_admin());

-- Permitir que usuários deletem suas próprias configurações
CREATE POLICY "Users can delete own zap_responder_settings" 
ON public.zap_responder_settings 
FOR DELETE 
USING (auth.uid() = user_id OR is_admin());