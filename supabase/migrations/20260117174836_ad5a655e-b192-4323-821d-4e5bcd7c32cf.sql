-- Create table for panel links
CREATE TABLE public.panel_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT DEFAULT 'ExternalLink',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.panel_links ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (admin only)
CREATE POLICY "Admins can manage panel_links" 
ON public.panel_links 
FOR ALL 
USING (is_admin());

CREATE POLICY "Authenticated users can view panel_links" 
ON public.panel_links 
FOR SELECT 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_panel_links_updated_at
BEFORE UPDATE ON public.panel_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();