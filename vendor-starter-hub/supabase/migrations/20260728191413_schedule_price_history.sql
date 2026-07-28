-- Schedule the daily price snapshot, entirely inside Supabase.
--
-- WHY NOT A VERCEL CRON. Because it would not run. The Vercel project has no
-- Supabase env vars set in project settings, so a git build cannot talk to the
-- database at all, and that is the thing blocking the pending merge. pg_cron
-- and pg_net are available on this plan, so the schedule lives here instead
-- and starts working immediately. Price history is the one thing that cannot
-- be backfilled: a day nobody recorded is simply gone.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- The shared secret
-- ---------------------------------------------------------------------------
-- Generated once, into Supabase Vault, never into this file. pg_cron reads it
-- here and the Edge Function checks it through public.verify_cron_secret(), so
-- there is exactly one copy and nothing to keep in sync.
--
-- Run once per environment (this is data, not schema, so it is not re-applied
-- with the migration):
--
--   select vault.create_secret(
--     encode(extensions.gen_random_bytes(32), 'base64'),
--     'price_history_cron_secret',
--     'Shared secret pg_cron presents to the price-history-snapshot Edge Function.'
--   );

-- ---------------------------------------------------------------------------
-- Daily snapshot
-- ---------------------------------------------------------------------------
-- 10:17 UTC = 3:17am Pacific in summer, 2:17am in winter. Deliberately in the
-- small hours and deliberately not on the hour: every scheduler on the
-- internet fires at :00, and this API is flaky enough on a quiet minute.
--
-- The job is safe to fire more than once. The function refuses a second run on
-- a day it already completed, so a late catch-up followed by the real schedule
-- costs one HTTP round trip and no upstream calls.
do $$
begin
  perform cron.unschedule('price-history-daily');
exception when others then
  null; -- not scheduled yet, which is the normal case on a fresh database
end $$;

select cron.schedule(
  'price-history-daily',
  '17 10 * * *',
  $cron$
  select net.http_post(
    url := 'https://qqfshinnpaxvggiscpcd.supabase.co/functions/v1/price-history-snapshot',
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

-- ---------------------------------------------------------------------------
-- Weekly prune
-- ---------------------------------------------------------------------------
-- Kept separate from the snapshot on purpose: pruning failing must never be
-- able to stop the day from being recorded, and recording failing must never
-- leave the table growing unattended. Sundays, well after the daily run.
do $$
begin
  perform cron.unschedule('price-history-prune');
exception when others then
  null;
end $$;

select cron.schedule(
  'price-history-prune',
  '43 11 * * 0',
  $cron$ select public.prune_price_history(400); $cron$
);
