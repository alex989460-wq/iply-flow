-- Add parent_reseller_id for hierarchical resellers (null = created by admin)
ALTER TABLE public.reseller_access 
ADD COLUMN parent_reseller_id uuid REFERENCES public.reseller_access(id) ON DELETE SET NULL;

-- Add credits column for the credit system (1 credit = 1 month)
ALTER TABLE public.reseller_access 
ADD COLUMN credits integer NOT NULL DEFAULT 0;

-- Create index for faster hierarchical queries
CREATE INDEX idx_reseller_access_parent ON public.reseller_access(parent_reseller_id);

-- Allow resellers to view their own sub-resellers
CREATE POLICY "Resellers can view their sub-resellers"
ON public.reseller_access
FOR SELECT
USING (parent_reseller_id = auth.uid() OR user_id = auth.uid() OR is_admin());

-- Allow resellers to insert sub-resellers (they become the parent)
CREATE POLICY "Resellers can create sub-resellers"
ON public.reseller_access
FOR INSERT
WITH CHECK (
  is_admin() OR 
  (parent_reseller_id = auth.uid() AND (SELECT credits FROM public.reseller_access WHERE user_id = auth.uid()) >= 1)
);

-- Allow resellers to update their own sub-resellers (for renewal)
CREATE POLICY "Resellers can update their sub-resellers"
ON public.reseller_access
FOR UPDATE
USING (is_admin() OR parent_reseller_id = auth.uid());

-- Allow resellers to delete their own sub-resellers
CREATE POLICY "Resellers can delete their sub-resellers"
ON public.reseller_access
FOR DELETE
USING (is_admin() OR parent_reseller_id = auth.uid());

-- Drop old conflicting policies if they exist (they were admin-only)
DROP POLICY IF EXISTS "Admins can view reseller_access" ON public.reseller_access;
DROP POLICY IF EXISTS "Admins can insert reseller_access" ON public.reseller_access;
DROP POLICY IF EXISTS "Admins can update reseller_access" ON public.reseller_access;
DROP POLICY IF EXISTS "Admins can delete reseller_access" ON public.reseller_access;