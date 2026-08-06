-- Create Enum for Session Status
CREATE TYPE public.whatsapp_utility_outcome AS ENUM ('SUCCESS', 'RECATEGORIZED', 'REJECTED', 'HARD_STOP');

-- 1. Create Sessions Table
CREATE TABLE public.whatsapp_utility_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    base_name TEXT NOT NULL,
    business_purpose TEXT,
    trigger_event TEXT,
    utility_risk TEXT,
    final_outcome public.whatsapp_utility_outcome,
    context JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Attempts Table
CREATE TABLE public.whatsapp_utility_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.whatsapp_utility_sessions(id) ON DELETE CASCADE NOT NULL,
    attempt_no INTEGER NOT NULL,
    template_name TEXT NOT NULL,
    body TEXT NOT NULL,
    strictness_level INTEGER DEFAULT 1,
    status TEXT, -- PENDING, APPROVED, REJECTED
    category TEXT, -- UTILITY, MARKETING, AUTHENTICATION
    outcome public.whatsapp_utility_outcome,
    rejection_reason TEXT,
    meta_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Summary/Knowledge Table
CREATE TABLE public.whatsapp_utility_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    clusters JSONB DEFAULT '[]'::jsonb,
    anti_patterns TEXT[] DEFAULT '{}',
    summarized_at TIMESTAMPTZ DEFAULT now()
);

-- Grants
GRANT ALL ON public.whatsapp_utility_sessions TO authenticated;
GRANT ALL ON public.whatsapp_utility_attempts TO authenticated;
GRANT ALL ON public.whatsapp_utility_summary TO authenticated;
GRANT ALL ON public.whatsapp_utility_sessions TO service_role;
GRANT ALL ON public.whatsapp_utility_attempts TO service_role;
GRANT ALL ON public.whatsapp_utility_summary TO service_role;

-- RLS
ALTER TABLE public.whatsapp_utility_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_utility_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_utility_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sessions" ON public.whatsapp_utility_sessions
    FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage attempts of their sessions" ON public.whatsapp_utility_attempts
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.whatsapp_utility_sessions WHERE id = session_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can view summaries" ON public.whatsapp_utility_summary
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.whatsapp_utility_sessions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
