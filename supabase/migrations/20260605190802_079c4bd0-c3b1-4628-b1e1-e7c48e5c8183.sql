select cron.schedule(
  'evolution-billing-every-minute',
  '* * * * *',
  $$select net.http_post(
    url:='https://fphqfgxfeaylldpxjqan.supabase.co/functions/v1/scheduled-billing-evolution',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaHFmZ3hmZWF5bGxkcHhqcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTYwMDAsImV4cCI6MjA4MjU3MjAwMH0.PsIJenRZEAWTlxbdGYvJWrBUfiIifPn9Q_UVeUyrFs8"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;$$
);