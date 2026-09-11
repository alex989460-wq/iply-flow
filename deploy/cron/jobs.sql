-- Agendamentos (13 rotinas) recriados apontando para a VPS.
-- Rode DEPOIS que as funções estiverem publicadas e ANTES da virada,
-- porém com os jobs ainda desativados (veja CUTOVER.md).
--
-- Substitua:
--   __DOMAIN__      -> supergestor.top
--   __SERVICE_KEY__ -> valor de SERVICE_ROLE_KEY em /opt/supergestor/keys.env

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  base text := 'https://__DOMAIN__/functions/v1/';
  key  text := '__SERVICE_KEY__';
  j    record;
  jobs jsonb := '[
    {"name":"scheduled-billing-check",        "sched":"* * * * *",    "fn":"scheduled-billing"},
    {"name":"zap-billing-every-minute",       "sched":"* * * * *",    "fn":"scheduled-billing"},
    {"name":"evolution-billing-every-minute", "sched":"* * * * *",    "fn":"scheduled-billing-evolution"},
    {"name":"daily-report-2359",              "sched":"59 2 * * *",   "fn":"daily-report"},
    {"name":"keep-window-alive-hourly",       "sched":"0 * * * *",    "fn":"keep-window-alive"},
    {"name":"ai-training-continuous-learn",   "sched":"*/15 * * * *", "fn":"ai-training-analyze"},
    {"name":"clouddy-keepalive-5m",           "sched":"*/5 * * * *",  "fn":"clouddy-keepalive"},
    {"name":"ibosol-keepalive-1min",          "sched":"* * * * *",    "fn":"ibosol-keepalive"},
    {"name":"iboplayerpro-keepalive-10min",   "sched":"*/10 * * * *", "fn":"iboplayerpro-keepalive"},
    {"name":"auto-backup-hourly-check",       "sched":"* * * * *",    "fn":"auto-backup"},
    {"name":"cakto-email-backfill-daily",     "sched":"20 3 * * *",   "fn":"cakto-email-backfill"},
    {"name":"efi-reconcile-every-minute",     "sched":"* * * * *",    "fn":"efi-reconcile"},
    {"name":"task-reminders-every-minute",    "sched":"* * * * *",    "fn":"task-reminders"}
  ]'::jsonb;
begin
  for j in select * from jsonb_to_recordset(jobs) as x(name text, sched text, fn text) loop
    perform cron.unschedule(j.name) where exists (select 1 from cron.job where jobname = j.name);
    perform cron.schedule(
      j.name, j.sched,
      format(
        $q$select net.http_post(
             url := %L,
             headers := %L::jsonb,
             body := '{"source":"cron"}'::jsonb
           );$q$,
        base || j.fn,
        json_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || key
        )::text
      )
    );
  end loop;
end $$;

-- Conferir:
-- select jobname, schedule, active from cron.job order by jobname;
-- Desativar todos temporariamente (antes da virada):
-- update cron.job set active = false;
