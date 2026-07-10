select cron.unschedule('p2cine-keepalive-5m')
where exists (
  select 1
  from cron.job
  where jobname = 'p2cine-keepalive-5m'
);