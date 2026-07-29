-- Alerts: tell a vendor when a card they are hunting has fallen against its
-- OWN recent history, and push it to their phone once a day.
--
-- WHAT THIS CAN HONESTLY CLAIM, AND WHAT IT CANNOT. It watches the market
-- price of a card against the 30-day record built by the snapshot job. It does
-- NOT see anybody's listings — that needs the eBay Browse API and is still
-- blocked on an application. So every string this feature renders says "market
-- price vs its own history" and never "a listing is available". The watchlist
-- was careful not to tell that lie and neither is this.
--
-- WHY AGAINST ITS OWN HISTORY RATHER THAN TODAY'S MARKET. Because "20% under
-- market" is trivially satisfied when the market itself is collapsing, which
-- is exactly when you should not be buying. A card cheap against its own
-- 30-day average is a different, better statement.

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
-- One row per browser/device that agreed to be notified. The endpoint is the
-- push service's URL for that device and is unique globally, not per user: if
-- two people sign in on the same browser profile the endpoint is the same
-- physical mailbox, and the last person to opt in owns it. Two rows would
-- deliver one person's watchlist to the other.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,

  endpoint text not null unique,
  -- The device's public key and auth secret, from the browser's
  -- PushSubscription. Useless without the endpoint, but still that device's
  -- keys, so RLS keeps them owner-scoped like everything else here.
  p256dh text not null,
  auth   text not null,

  user_agent text,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error   text,
  -- A dead endpoint (uninstalled PWA, revoked permission) 404s or 410s
  -- forever. Counted here so the sender can retire it rather than fail nightly.
  failure_count int not null default 0,

  constraint push_endpoint_len check (char_length(endpoint) between 10 and 1000),
  constraint push_p256dh_len   check (char_length(p256dh)   between 10 and 200),
  constraint push_auth_len     check (char_length(auth)     between 4 and 100),
  constraint push_ua_len       check (user_agent is null or char_length(user_agent) <= 300)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_own on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- alert_settings
-- ---------------------------------------------------------------------------
-- Defaults chosen to under-send rather than over-send. The failure mode that
-- kills a notification feature is not "missed a deal", it is "buzzed me for
-- nothing on a Tuesday", because that gets permission revoked and you never
-- get it back.
create table public.alert_settings (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,

  enabled boolean not null default true,

  -- How far under its own 30-day average a card must be before it is worth a
  -- buzz. 15% is roughly the bottom of the range the roadmap asks for.
  min_pct_under numeric(5,2) not null default 15,

  -- Refuse to speak until there is enough recorded history to mean it. "Under
  -- its 30-day average" computed from two days is not an insight, it is
  -- arithmetic on noise.
  min_recorded_days integer not null default 7,

  -- Snooze. Someone at a three-day show does not want their phone going off.
  quiet_until date,

  updated_at timestamptz not null default now(),

  constraint alert_min_pct_sane  check (min_pct_under >= 5 and min_pct_under <= 90),
  constraint alert_min_days_sane check (min_recorded_days between 3 and 30)
);

alter table public.alert_settings enable row level security;

create policy alert_settings_own on public.alert_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger alert_settings_touch_updated_at
  before update on public.alert_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------
-- Every alert that was RAISED, whether or not it was delivered. The two are
-- separate on purpose: a phone that was off, a subscription that had expired
-- and a card that never qualified are three different stories, and only one of
-- them is a bug.
--
-- Numbers are snapshotted at the moment of raising. Re-deriving them later
-- from live prices would quietly rewrite history and make an old alert look
-- wrong when it was right.
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  watch_id uuid not null
    references public.watchlist(id) on delete cascade,

  card_id   text not null,
  card_name text not null,
  finish    text not null,
  day       date not null,

  market        numeric(10,2) not null,
  average       numeric(10,2) not null,
  pct_under     numeric(6,2)  not null,
  recorded_days integer       not null,
  -- The watch's own pay-up-to figure at that moment, when it had one. Lets the
  -- alert say "and it is inside your ceiling" rather than only "it is cheap".
  ceiling numeric(10,2),

  created_at  timestamptz not null default now(),
  notified_at timestamptz,

  -- One alert per watch per day, so a job that runs twice cannot buzz twice.
  unique (watch_id, day),

  constraint alerts_market_sane  check (market  > 0 and market  <= 1000000),
  constraint alerts_average_sane check (average > 0 and average <= 1000000),
  constraint alerts_pct_sane     check (pct_under > 0 and pct_under <= 100),
  constraint alerts_days_sane    check (recorded_days >= 2)
);

create index alerts_user_created_idx on public.alerts (user_id, created_at desc);
-- The cooldown check reads "has this watch alerted recently"; this serves it.
create index alerts_watch_day_idx on public.alerts (watch_id, day desc);

alter table public.alerts enable row level security;

-- Read-only to the person they belong to. Alerts are raised by the scheduled
-- job as service_role; nothing a user does should be able to invent one.
create policy alerts_read_own on public.alerts
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- alert_runs
-- ---------------------------------------------------------------------------
create table public.alert_runs (
  id uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  day date,
  status text not null default 'running'
    check (status in ('running','ok','partial','failed','skipped_already_ran')),

  candidates      integer not null default 0,
  alerts_raised   integer not null default 0,
  people_notified integer not null default 0,
  pushes_sent     integer not null default 0,
  pushes_failed   integer not null default 0,
  subscriptions_retired integer not null default 0,
  detail text,

  constraint alert_runs_detail_len check (detail is null or char_length(detail) <= 2000)
);

create index alert_runs_started_idx on public.alert_runs (started_at desc);
create index alert_runs_day_idx on public.alert_runs (day);

alter table public.alert_runs enable row level security;
-- Service role only, same as price_history_runs.

-- ---------------------------------------------------------------------------
-- The VAPID signing key
-- ---------------------------------------------------------------------------
-- Held in Vault so it is set once and read by the sender, the same pattern as
-- the cron secret. The PUBLIC half is not here and is not secret — it is
-- compiled into the browser bundle by design, because the browser has to hand
-- it to the push service when subscribing.
create or replace function public.get_vapid_private_jwk()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = 'vapid_private_jwk';
$$;

revoke execute on function public.get_vapid_private_jwk() from public, anon, authenticated;
grant  execute on function public.get_vapid_private_jwk() to service_role;

-- ---------------------------------------------------------------------------
-- alert_candidates
-- ---------------------------------------------------------------------------
-- Everything the nightly sender needs, in one query, with ZERO calls to the
-- price API. The digest runs after the snapshot, so today's price is already a
-- row in price_history — asking the provider again would spend quota to learn
-- something we wrote an hour ago.
--
-- Today is excluded from its own average (the window is p_day-30 .. p_day-1).
-- Including it would drag the comparison toward zero difference, which is the
-- same rule lib/price-history.ts follows for the on-screen trend.
--
-- Settings are LEFT JOINed with the table defaults inlined below, so a user who
-- has never opened the settings still gets sensible thresholds rather than
-- being silently excluded.
create or replace function public.alert_candidates(p_day date)
returns table (
  user_id uuid,
  watch_id uuid,
  card_id text,
  card_name text,
  finish text,
  market numeric,
  average numeric,
  pct_under numeric,
  recorded_days integer,
  target_kind text,
  target_price numeric,
  target_pct numeric,
  last_alert_day date,
  last_alert_pct numeric
)
language sql
security definer
set search_path = ''
stable
as $$
  with settings as (
    select w.id as watch_id,
           w.user_id,
           w.card_id,
           w.card_name,
           w.finish as pinned_finish,
           w.target_kind,
           w.target_price,
           w.target_pct,
           coalesce(s.enabled, true)             as enabled,
           coalesce(s.min_pct_under, 15)         as min_pct_under,
           coalesce(s.min_recorded_days, 7)      as min_recorded_days,
           s.quiet_until
      from public.watchlist w
      left join public.alert_settings s on s.user_id = w.user_id
     where w.active
  ),
  -- A watch with no pinned finish follows "whichever printing is worth the
  -- most", exactly as the watchlist page resolves it — using today's recorded
  -- row so the alert is judged on the same printing the screen shows.
  resolved as (
    select st.*,
           coalesce(
             st.pinned_finish,
             (select ph.finish
                from public.price_history ph
               where ph.card_id = st.card_id and ph.day = p_day
               order by coalesce(ph.market, ph.low) desc
               limit 1)
           ) as finish
      from settings st
     where st.enabled
       and (st.quiet_until is null or st.quiet_until < p_day)
  )
  select r.user_id,
         r.watch_id,
         r.card_id,
         r.card_name,
         r.finish,
         today.price                                             as market,
         round(hist.avg_price, 2)                                as average,
         round(((hist.avg_price - today.price) / hist.avg_price) * 100, 2) as pct_under,
         hist.days                                               as recorded_days,
         r.target_kind,
         r.target_price,
         r.target_pct,
         prev.day                                                as last_alert_day,
         prev.pct_under                                          as last_alert_pct
    from resolved r
    join lateral (
      select coalesce(ph.market, ph.low) as price
        from public.price_history ph
       where ph.card_id = r.card_id and ph.finish = r.finish and ph.day = p_day
       limit 1
    ) today on today.price is not null and today.price > 0
    join lateral (
      select avg(coalesce(ph.market, ph.low)) as avg_price,
             count(*)::int                    as days
        from public.price_history ph
       where ph.card_id = r.card_id
         and ph.finish  = r.finish
         and ph.day    >= p_day - 30
         and ph.day    <  p_day
         and coalesce(ph.market, ph.low) > 0
    ) hist on hist.days >= r.min_recorded_days and hist.avg_price > 0
    left join lateral (
      select a.day, a.pct_under
        from public.alerts a
       where a.watch_id = r.watch_id
       order by a.day desc
       limit 1
    ) prev on true
   where ((hist.avg_price - today.price) / hist.avg_price) * 100 >= r.min_pct_under
   order by ((hist.avg_price - today.price) / hist.avg_price) desc
$$;

revoke execute on function public.alert_candidates(date) from public, anon, authenticated;
grant  execute on function public.alert_candidates(date) to service_role;
