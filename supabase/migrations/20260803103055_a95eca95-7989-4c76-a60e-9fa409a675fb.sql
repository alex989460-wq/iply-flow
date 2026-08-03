CREATE TABLE public.cakto_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  email text NOT NULL,
  phone text,
  name text,
  username text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cakto_contacts TO authenticated;
GRANT ALL ON public.cakto_contacts TO service_role;

ALTER TABLE public.cakto_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view cakto contacts"
ON public.cakto_contacts FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.is_admin());

CREATE UNIQUE INDEX cakto_contacts_owner_email_idx
  ON public.cakto_contacts (COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));
CREATE INDEX cakto_contacts_phone_idx ON public.cakto_contacts (phone);
CREATE INDEX cakto_contacts_username_idx ON public.cakto_contacts (lower(username));

CREATE TRIGGER cakto_contacts_updated_at
BEFORE UPDATE ON public.cakto_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();