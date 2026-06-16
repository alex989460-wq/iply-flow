
CREATE TABLE public.reseller_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  days INTEGER NOT NULL DEFAULT 30,
  created_by UUID NOT NULL,
  used_by UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_access_codes TO authenticated;
GRANT ALL ON public.reseller_access_codes TO service_role;

ALTER TABLE public.reseller_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all access codes"
ON public.reseller_access_codes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
