ALTER TABLE public.ai_knowledge_entries
ADD COLUMN IF NOT EXISTS media_url text,
ADD COLUMN IF NOT EXISTS media_mime text,
ADD COLUMN IF NOT EXISTS media_type text,
ADD COLUMN IF NOT EXISTS media_filename text;