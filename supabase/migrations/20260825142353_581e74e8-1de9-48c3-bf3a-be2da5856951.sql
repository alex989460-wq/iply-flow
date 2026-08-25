ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS exclude_active_phones boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS filter_config jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.broadcast_campaigns
SET exclude_active_phones = true,
    filter_config = coalesce(filter_config, '{}'::jsonb) || jsonb_build_object('exclude_active_phones', true, 'auto_recovery_guard', true)
WHERE coalesce(exclude_active_phones, false) = false
  AND (
    lower(coalesce(template_name, '') || ' ' || coalesce(name, '')) ~ '(inadimpl|cobran|recupera|vencid|atrasad)'
  );