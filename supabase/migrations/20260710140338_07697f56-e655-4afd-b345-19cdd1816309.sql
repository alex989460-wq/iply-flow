select cron.unschedule('clouddy-keepalive-2h');
select cron.schedule(
  'clouddy-keepalive-5m',
  '*/5 * * * *',
  $$ select net.http_post(
    url := 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/clouddy-keepalive',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);