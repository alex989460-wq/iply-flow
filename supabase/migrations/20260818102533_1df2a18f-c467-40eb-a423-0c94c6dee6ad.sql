CREATE TABLE public.lead_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'active'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_lists TO authenticated;
GRANT ALL ON public.lead_lists TO service_role;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own lead lists" ON public.lead_lists
    FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    address TEXT,
    city TEXT,
    category TEXT,
    site TEXT,
    whatsapp_available BOOLEAN DEFAULT FALSE,
    score TEXT DEFAULT 'morno',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own leads" ON public.leads
    FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.lead_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.lead_lists(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at TIMESTAMPTZ,
    UNIQUE(list_id, lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_list_items TO authenticated;
GRANT ALL ON public.lead_list_items TO service_role;
ALTER TABLE public.lead_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own lead list items" ON public.lead_list_items
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.lead_lists 
            WHERE id = lead_list_items.list_id AND user_id = auth.uid()
        )
    );

CREATE TABLE public.lead_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT ON public.lead_history TO authenticated;
GRANT ALL ON public.lead_history TO service_role;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their leads history" ON public.lead_history
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.leads 
            WHERE id = lead_history.lead_id AND user_id = auth.uid()
        )
    );
