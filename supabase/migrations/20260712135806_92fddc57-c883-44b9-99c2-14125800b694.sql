ALTER TABLE public.pending_manual_renewals ADD COLUMN IF NOT EXISTS locked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_pmr_locked_at ON public.pending_manual_renewals(locked_at);