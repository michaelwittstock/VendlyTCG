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

## alert-digest

Once a day, thirty minutes after the snapshot, tells each vendor which of the
cards they are watching has fallen against **its own recent average**. One push
notification per person per day, never one per card.

Costs nothing upstream: it reads today's price out of `price_history`, which
the snapshot job wrote half an hour earlier. Every number in every notification
comes from one SQL function (`alert_candidates`).

### What it is allowed to claim

That a card's market price is below its own 30-day average. That is all. It has
not seen a listing, a seller or an auction — that needs the eBay Browse API and
is a separate, still-blocked roadmap row. The copy in `lib/alerts.ts` is written
to be true without it, and a unit test asserts the wording never implies
otherwise.

### The rules that keep permission from being revoked

The failure mode that kills a notification feature is not a missed deal, it is a
pointless buzz — and on iOS a revoked permission cannot be re-prompted for.

- **One digest a day**, at most three cards named, the rest counted.
- **Seven-day cooldown per card**, broken only if it has fallen a further 5
  points. A card 20% under today is usually still 20% under tomorrow.
- **Minimum recorded days** (default 7) before a card can alert at all. "Under
  its 30-day average" computed from two days is arithmetic on noise.
- **Silence when there is nothing.** No daily "no deals today".

Defaults live in `alert_settings` and are editable per person on the watchlist.

### Web Push

Encryption (RFC 8291) and VAPID (RFC 8292) are implemented directly on
WebCrypto in `webpush.ts` rather than pulling `npm:web-push` into an edge
runtime. `npm run test:push` verifies it by **decrypting** a message as a
browser would and by verifying the JWT signature — a wrong byte here produces a
notification that silently never arrives, with no error anywhere.

The VAPID private key is in Vault (`vapid_private_jwk`); the public half is a
constant in `lib/push.ts` and is public by design.

**No manual step for this one.** Notifications work as soon as the watchlist UI
ships with the branch merge.

### Checking on it

```sql
select day, status, candidates, alerts_raised, people_notified,
       pushes_sent, pushes_failed, subscriptions_retired, detail
  from public.alert_runs order by started_at desc limit 14;
```

`candidates` greater than `alerts_raised` is normal — the difference is cards
inside their cooldown. `alerts_raised` greater than `people_notified` means
someone has no subscribed device, which is also normal: they see the alerts in
the app.
