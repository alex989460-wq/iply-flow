
CREATE TABLE public.evolution_stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/webp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_stickers TO authenticated;
GRANT ALL ON public.evolution_stickers TO service_role;
ALTER TABLE public.evolution_stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stickers_own" ON public.evolution_stickers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX evolution_stickers_user_idx ON public.evolution_stickers(user_id, created_at DESC);

-- Storage policies for evolution-stickers bucket (path = {user_id}/filename)
CREATE POLICY "stickers_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evolution-stickers' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "stickers_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evolution-stickers' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "stickers_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'evolution-stickers' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "stickers_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'evolution-stickers' AND auth.uid()::text = (storage.foldername(name))[1]);
