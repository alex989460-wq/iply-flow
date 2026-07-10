select cron.schedule(
  'clouddy-keepalive-2h',
  '0 */2 * * *',
  $$ select net.http_post(
    url := 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/clouddy-keepalive',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);