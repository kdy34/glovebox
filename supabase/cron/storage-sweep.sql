-- T095: nightly storage sweep. Not a migration: it needs pg_cron, pg_net and per-project
-- values, so run it once per environment (SQL editor, or psql against the project).
--
--   1. supabase secrets set SWEEP_SECRET=<long random string>
--   2. In Vault, store the project URL and the same secret:
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<the same long random string>', 'sweep_secret');
--   3. Run this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('storage-sweep') where exists (select 1 from cron.job where jobname = 'storage-sweep');
select cron.schedule(
  'storage-sweep',
  '17 4 * * *', -- 04:17 UTC daily
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/storage-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sweep_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
