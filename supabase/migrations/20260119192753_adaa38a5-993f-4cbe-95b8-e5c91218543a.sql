-- Tabela para configurar gatilhos automáticos de bot
CREATE TABLE public.bot_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('inadimplente', 'boas_vindas', 'renovacao', 'lembrete')),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  days_offset INTEGER DEFAULT 0, -- dias antes/depois do evento (negativo = antes, positivo = depois)
  bot_department_id TEXT, -- ID do departamento do bot
  bot_department_name TEXT, -- Nome do departamento
  message_template TEXT, -- Mensagem inicial opcional
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, trigger_type)
);

-- Enable RLS
ALTER TABLE public.bot_triggers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own bot_triggers" 
ON public.bot_triggers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bot_triggers" 
ON public.bot_triggers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bot_triggers" 
ON public.bot_triggers 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bot_triggers" 
ON public.bot_triggers 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_bot_triggers_updated_at
BEFORE UPDATE ON public.bot_triggers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();