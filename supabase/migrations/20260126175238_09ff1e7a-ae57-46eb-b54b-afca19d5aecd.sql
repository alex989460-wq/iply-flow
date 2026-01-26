-- Fix FK to match app logic: parent_reseller_id stores the parent user's id (reseller_access.user_id)

ALTER TABLE public.reseller_access
  DROP CONSTRAINT IF EXISTS reseller_access_parent_reseller_id_fkey;

ALTER TABLE public.reseller_access
  ADD CONSTRAINT reseller_access_parent_reseller_id_fkey
  FOREIGN KEY (parent_reseller_id)
  REFERENCES public.reseller_access(user_id)
  ON DELETE SET NULL;