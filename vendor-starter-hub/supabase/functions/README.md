# Supabase Edge Functions

Deployed to the `vendly-tcg` project (`qqfshinnpaxvggiscpcd`) via the Supabase
API, not the CLI, so there is no local Supabase stack to run these against yet.

These files are excluded from the Next.js type check in `tsconfig.json`. They
are Deno, not Node: they import from `jsr:` and use `Deno.env`, neither of
which the app's TypeScript config knows about.

## price-history-snapshot

Records the market price of every actively watched card once a day, per finish,
into `public.price_history`. This is the foundation the deal alert engine needs
— it is what lets the watchlist say "this is 20% under its own 30-day average"
rather than only "under today's market", which is the number that moves when a
card is being dumped.

Runs on `pg_cron` inside Supabase (`price-history-daily`, 10:17 UTC), **not** on
a Vercel cron, so it works today rather than after the pending Vercel env-var
change and branch merge. History cannot be backfilled: a day nobody recorded is
gone, so waiting was the expensive option.

**Auth.** `verify_jwt` is off — pg_cron has no user session to present. Callers
must send `x-cron-secret`, checked against Supabase Vault by
`public.verify_cron_secret()`. Two more things make a leaked secret cheap: the
job refuses a second run on a day it already completed, and it caps its own
upstream calls.

### One manual step, worth two minutes

Set **`POKEMONTCG_API_KEY`** in Supabase → Edge Functions → Secrets. The key is
free from [dev.pokemontcg.io](https://dev.pokemontcg.io).

Without it the job still runs, but it is capped at 10 upstream calls per run
(200 cards). That cap exists because the keyless ceiling of 1,000 requests/day
is shared with the public price checker, the watchlist and Show mode's
save-to-device — all of which call out from our servers, not the visitor's. A
growing watchlist must never be able to take the public price checker down.

With the key the account ceiling is 20,000/day and the cap rises to 400 calls
(8,000 cards). The same key is also worth setting in Vercel for the web app;
they are separate environments and each needs its own copy.

### Checking on it

```sql
-- Did it run, and how did it go?
select day, status, cards_requested, cards_resolved, rows_written, keyed, detail
  from public.price_history_runs
 order by started_at desc limit 14;

-- Is it still scheduled?
select jobname, schedule, active from cron.job;

-- Force a re-run of today (the only way past the once-a-day guard)
select net.http_post(
  url := 'https://qqfshinnpaxvggiscpcd.supabase.co/functions/v1/price-history-snapshot?force=1',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                       where name = 'price_history_cron_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 120000);
```

A run that is not `ok` always carries its reason in `detail`. A `status` of
`partial` means the day was recorded but not completely — capped, or an
upstream batch failed after five attempts.
