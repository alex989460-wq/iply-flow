-- Schedule hourly job to keep WhatsApp 24h window alive on each user's notification phone
SELECT cron.schedule(
  'keep-window-alive-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/keep-window-alive',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);