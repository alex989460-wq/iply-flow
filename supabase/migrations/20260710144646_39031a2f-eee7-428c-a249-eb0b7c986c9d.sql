select cron.schedule(
  'p2cine-keepalive-5m',
  '*/5 * * * *',
  $$ select net.http_post(
    url := 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/p2cine-keepalive',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);