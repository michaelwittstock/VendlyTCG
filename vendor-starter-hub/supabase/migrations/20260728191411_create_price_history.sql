-- Price history: the market price of a watched card, recorded once a day.
--
-- WHY THIS EXISTS. Until now the watchlist knew two numbers -- what a card is
-- worth today, and what it was worth the day you added it. Nothing in
-- between. That is enough to say "down $12 since you added it" and nothing
-- more. A daily record lets the page say "this is 20% under its own 30-day
-- average", which is a better reason to buy than "under today's market" --
-- today's market is exactly the number that moves when a card is being dumped.
--
-- This is the foundation the deal alert engine sits on. The engine itself
-- needs the eBay Browse API to see real listings and is blocked on that
-- application; this needs nothing but a schedule, so it ships first and on
-- its own.

-- ---------------------------------------------------------------------------
-- price_history
-- ---------------------------------------------------------------------------
-- NOT owner-scoped storage, deliberately. What a card was worth on a given day
-- is the same fact for every vendor watching it. A copy per user would
-- multiply rows for no extra information and undo the batching that keeps
-- upstream lookups cheap -- a card watched by three people is already one API
-- call, not three. Reads ARE owner-scoped; see the policy below.
--
-- Per finish, always. Holo, reverse holo and normal diverge, and a single
-- blended trend line would describe no real card. The provider returns every
-- finish in the same response, so recording all of them costs nothing extra.
create table public.price_history (
  card_id text not null,
  finish  text not null,
  day     date not null,

  market numeric(10,2),
  low    numeric(10,2),
  high   numeric(10,2),

  -- The provider's own "prices last updated" stamp. If this stops moving
  -- while our runs keep succeeding, the provider went stale, not the job.
  priced_at   text,
  source      text not null default 'pokemontcg.io',
  recorded_at timestamptz not null default now(),

  -- One row per card, per finish, per day. A job that runs twice -- a retry, a
  -- manual trigger, a cron that fires late and then again on time -- must not
  -- be able to record the same day twice.
  primary key (card_id, finish, day),

  constraint price_history_card_id_len check (char_length(card_id) between 1 and 64),
  constraint price_history_finish_len  check (char_length(finish)  between 1 and 40),
  constraint price_history_source_len  check (char_length(source)  between 1 and 40),
  -- Mirrors the provider normaliser, which drops any finish with neither a
  -- market nor a low price. A row with no price at all is not a data point,
  -- and averaging it in as a zero would be worse than having no row.
  constraint price_history_has_a_price check (market is not null or low is not null),
  constraint price_history_market_sane check (market is null or (market > 0 and market <= 1000000)),
  constraint price_history_low_sane    check (low    is null or (low    > 0 and low    <= 1000000)),
  constraint price_history_high_sane   check (high   is null or (high   > 0 and high   <= 1000000)),
  -- Lower bound only: current_date is not immutable and Postgres will not
  -- accept it in a check. The writer clamps the upper end to its own today.
  constraint price_history_day_sane    check (day >= date '2026-01-01')
);

comment on table public.price_history is
  'Daily market price per card per finish. Written only by the scheduled snapshot job (service_role); readable by a user for cards on their own watchlist.';

-- Pruning walks by day; the primary key leads with card_id and cannot serve it.
create index price_history_day_idx on public.price_history (day);

alter table public.price_history enable row level security;

-- You can read the history of a card you are watching, and no others. There is
-- no insert/update/delete policy on purpose: the only writer is the scheduled
-- job, which runs as service_role and bypasses RLS entirely.
create policy price_history_read_own_watched on public.price_history
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.watchlist w
       where w.user_id = auth.uid()
         and w.card_id = price_history.card_id
    )
  );

-- ---------------------------------------------------------------------------
-- price_history_runs -- so a job that quietly stops is visible
-- ---------------------------------------------------------------------------
-- A scan that fails silently looks exactly like a card whose price did not
-- move: a flat line. Every run writes a row here, successful or not, so the
-- two are always tellable apart.
create table public.price_history_runs (
  id uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','ok','partial','failed','skipped_already_ran','skipped_budget')),

  cards_requested int not null default 0,
  cards_resolved  int not null default 0,
  rows_written    int not null default 0,
  batches         int not null default 0,
  batches_failed  int not null default 0,

  -- Whether POKEMONTCG_API_KEY was set for this run. Keyless runs are capped
  -- hard (see the Edge Function) so a growing watchlist can never quietly eat
  -- the public price checker's shared 1,000/day ceiling.
  keyed boolean not null default false,
  detail text,

  constraint price_history_runs_detail_len check (detail is null or char_length(detail) <= 2000)
);

create index price_history_runs_started_idx on public.price_history_runs (started_at desc);

alter table public.price_history_runs enable row level security;
-- No policies at all: run metadata is service_role only. The single fact the
-- UI legitimately needs is exposed narrowly by price_history_last_run().

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------

-- When the record was last successfully brought up to date, and how that run
-- went. The watchlist uses this to date its own trend lines honestly rather
-- than implying they are current. Returns nothing before the first run --
-- which the UI must render as "not recorded yet", not as "up to date".
create or replace function public.price_history_last_run()
returns table (finished_at timestamptz, status text, rows_written integer)
language sql
security definer
set search_path = ''
stable
as $$
  select r.finished_at, r.status, r.rows_written
    from public.price_history_runs r
   where r.status in ('ok', 'partial')
     and r.finished_at is not null
   order by r.finished_at desc
   limit 1;
$$;

revoke execute on function public.price_history_last_run() from public;
grant execute on function public.price_history_last_run() to authenticated, service_role;

-- Retention. 400 days keeps a full year plus a margin, so a card can be
-- compared against the same week last year, and stops the table growing
-- without bound for data nobody will read. The floor exists because a
-- mistyped argument here silently destroys the thing the feature is for.
create or replace function public.prune_price_history(p_keep_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_keep_days is null or p_keep_days < 30 then
    raise exception 'Refusing to prune price history to fewer than 30 days';
  end if;

  delete from public.price_history
   where day < current_date - p_keep_days;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_price_history(integer) from public;
grant execute on function public.prune_price_history(integer) to service_role;
