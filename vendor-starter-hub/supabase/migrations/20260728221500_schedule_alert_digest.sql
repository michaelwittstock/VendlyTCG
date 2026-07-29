-- Schedule the daily alert digest.
--
-- 10:47 UTC — thirty minutes after price-history-snapshot at 10:17. The gap is
-- deliberate and generous: the digest reads today's row out of price_history
-- and would find nothing if it overtook the snapshot. Thirty minutes is far
-- more than the snapshot needs even with every batch retrying five times.
--
-- Ordering is by clock rather than by chaining the two functions together, so
-- a snapshot that fails does not also take the digest down. A digest that
-- finds no row for today simply has no candidates and says so in its run log,
-- which is the correct behaviour: better silent than wrong.
do $$
begin
  perform cron.unschedule('alert-digest-daily');
exception when others then
  null; -- not scheduled yet, the normal case on a fresh database
end $$;

select cron.schedule(
  'alert-digest-daily',
  '47 10 * * *',
  $cron$
  select net.http_post(
    url := 'https://qqfshinnpaxvggiscpcd.supabase.co/functions/v1/alert-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets
        where name = 'price_history_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
