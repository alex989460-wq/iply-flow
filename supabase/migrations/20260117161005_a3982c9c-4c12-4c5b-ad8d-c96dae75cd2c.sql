-- Create table for quick messages/templates
CREATE TABLE public.quick_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  icon TEXT DEFAULT 'MessageSquare',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.quick_messages ENABLE ROW LEVEL SECURITY;

-- Create policies - all authenticated users can read
CREATE POLICY "Authenticated users can view quick messages" 
ON public.quick_messages 
FOR SELECT 
TO authenticated
USING (true);

-- Only admins can manage quick messages
CREATE POLICY "Admins can manage quick messages" 
ON public.quick_messages 
FOR ALL 
USING (public.is_admin());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_quick_messages_updated_at
BEFORE UPDATE ON public.quick_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default quick messages
INSERT INTO public.quick_messages (title, category, content, icon, sort_order) VALUES
('Como testar internet', 'suporte', 'Para testar sua conexão, acesse: https://speedtest.net e clique em "Iniciar". Envie o resultado para nós!', 'Wifi', 1),
('Como instalar o app', 'instalacao', 'Para instalar o aplicativo:
1. Acesse a Play Store ou App Store
2. Busque por "IPTV Player"
3. Instale e abra o app
4. Insira os dados que enviamos', 'Download', 2),
('Dados de acesso', 'acesso', 'Seus dados de acesso:
Usuário: {usuario}
Senha: {senha}
Servidor: {servidor}', 'Key', 3),
('Lembrete de vencimento', 'cobranca', 'Olá! Seu plano vence em {dias} dias. Renove agora para não ficar sem acesso!', 'Bell', 4),
('Boas-vindas', 'geral', 'Seja bem-vindo! Qualquer dúvida estamos à disposição. Bom entretenimento! 🎬', 'Smile', 5);