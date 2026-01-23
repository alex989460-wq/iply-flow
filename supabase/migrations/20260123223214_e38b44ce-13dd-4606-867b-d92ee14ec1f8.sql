-- Create table for automatic replies based on keywords
CREATE TABLE public.auto_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trigger_keyword TEXT NOT NULL,
  reply_message TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains', -- 'exact', 'contains', 'starts_with'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auto_replies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own auto_replies" 
ON public.auto_replies FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own auto_replies" 
ON public.auto_replies FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own auto_replies" 
ON public.auto_replies FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own auto_replies" 
ON public.auto_replies FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster keyword lookups
CREATE INDEX idx_auto_replies_user_enabled ON public.auto_replies(user_id, is_enabled);
CREATE INDEX idx_auto_replies_keyword ON public.auto_replies(trigger_keyword);

-- Trigger for updated_at
CREATE TRIGGER update_auto_replies_updated_at
BEFORE UPDATE ON public.auto_replies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for webhook logs (to track incoming messages)
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  event_type TEXT NOT NULL,
  phone_from TEXT,
  phone_to TEXT,
  message_content TEXT,
  raw_payload JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  auto_reply_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for webhook_logs
CREATE POLICY "Users can view own webhook_logs" 
ON public.webhook_logs FOR SELECT 
USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Service can insert webhook_logs" 
ON public.webhook_logs FOR INSERT 
WITH CHECK (true);

-- Index for performance
CREATE INDEX idx_webhook_logs_user_created ON public.webhook_logs(user_id, created_at DESC);