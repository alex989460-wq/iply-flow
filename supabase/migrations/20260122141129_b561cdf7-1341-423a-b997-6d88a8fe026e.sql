-- Add created_by column to quick_messages for per-reseller messages
ALTER TABLE public.quick_messages 
ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Update RLS policies to support per-user messages
DROP POLICY IF EXISTS "Authenticated users can view quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Admins can manage quick messages" ON public.quick_messages;

-- Users can view their own messages
CREATE POLICY "Users can view own quick_messages"
ON public.quick_messages FOR SELECT
USING (auth.uid() = created_by);

-- Users can insert their own messages
CREATE POLICY "Users can insert own quick_messages"
ON public.quick_messages FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Users can update their own messages
CREATE POLICY "Users can update own quick_messages"
ON public.quick_messages FOR UPDATE
USING (auth.uid() = created_by);

-- Users can delete their own messages
CREATE POLICY "Users can delete own quick_messages"
ON public.quick_messages FOR DELETE
USING (auth.uid() = created_by);