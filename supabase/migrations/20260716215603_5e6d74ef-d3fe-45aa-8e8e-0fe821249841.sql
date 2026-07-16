CREATE TABLE public.crm_oficial_hidden_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT,
  template_name TEXT NOT NULL,
  language TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT crm_oficial_hidden_templates_target_check CHECK (template_id IS NOT NULL OR template_name IS NOT NULL),
  CONSTRAINT crm_oficial_hidden_templates_unique UNIQUE (user_id, template_name, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_oficial_hidden_templates TO authenticated;
GRANT ALL ON public.crm_oficial_hidden_templates TO service_role;

ALTER TABLE public.crm_oficial_hidden_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own hidden CRM templates"
ON public.crm_oficial_hidden_templates
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_crm_oficial_hidden_templates_updated_at
BEFORE UPDATE ON public.crm_oficial_hidden_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();