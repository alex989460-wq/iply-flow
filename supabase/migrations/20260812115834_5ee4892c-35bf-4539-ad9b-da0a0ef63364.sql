ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS vplay_mysql_host text,
  ADD COLUMN IF NOT EXISTS vplay_mysql_port integer,
  ADD COLUMN IF NOT EXISTS vplay_mysql_user text,
  ADD COLUMN IF NOT EXISTS vplay_mysql_password text,
  ADD COLUMN IF NOT EXISTS vplay_mysql_database text;