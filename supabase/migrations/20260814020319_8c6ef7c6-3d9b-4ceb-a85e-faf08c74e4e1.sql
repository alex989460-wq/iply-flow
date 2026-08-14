ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS p2cine_session_cookie text,
  ADD COLUMN IF NOT EXISTS p2cine_session_at timestamptz,
  ADD COLUMN IF NOT EXISTS uniplay_session_token text,
  ADD COLUMN IF NOT EXISTS uniplay_session_pass text,
  ADD COLUMN IF NOT EXISTS uniplay_session_at timestamptz;