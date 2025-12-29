-- Add persistent default department selection to Zap Responder settings
ALTER TABLE public.zap_responder_settings
ADD COLUMN IF NOT EXISTS selected_department_id TEXT NULL,
ADD COLUMN IF NOT EXISTS selected_department_name TEXT NULL;

-- Optional: index for quick lookup (single-row table, but harmless)
CREATE INDEX IF NOT EXISTS idx_zap_responder_settings_selected_department_id
  ON public.zap_responder_settings (selected_department_id);