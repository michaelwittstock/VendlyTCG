-- Support for the scheduled snapshot job: the day a run belongs to, the
-- caller check, and the one query the job needs against the watchlist.

-- ---------------------------------------------------------------------------
-- Which day a run was for
-- ---------------------------------------------------------------------------
-- The job decides this in Pacific time and writes it here. "One run per day"
-- is then a plain equality test rather than a timestamp window, which would
-- need the UTC offset — and that offset changes twice a year, so a window
-- would quietly let a second run through on exactly the two nights nobody is
-- watching for it.
alter table public.price_history_runs
  add column day date;

create index price_history_runs_day_idx on public.price_history_runs (day);

-- ---------------------------------------------------------------------------
-- verify_cron_secret
-- ---------------------------------------------------------------------------
-- The Edge Function has no user session to check, because pg_cron does not
-- have one to give it. Instead the caller presents a shared secret held in
-- Supabase Vault, and this compares it. Vault is used rather than an env var
-- so the secret is set once, in one place, and pg_cron and the function read
-- the same copy — an env var would have to be kept in sync by hand.
--
-- Compared as SHA-256 digests: two fixed-length hex strings take the same time
-- to compare whatever the inputs were, so a wrong guess cannot be narrowed
-- down by timing the response. Cheap insurance on a public endpoint.
create or replace function public.verify_cron_secret(p_candidate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  if p_candidate is null or length(p_candidate) = 0 then
    return false;
  end if;

  select s.decrypted_secret into v_expected
    from vault.decrypted_secrets s
   where s.name = 'price_history_cron_secret';

  if v_expected is null then
    return false;
  end if;

  return encode(extensions.digest(v_expected,  'sha256'), 'hex')
       = encode(extensions.digest(p_candidate, 'sha256'), 'hex');
end;
$$;

revoke execute on function public.verify_cron_secret(text) from public;
grant execute on function public.verify_cron_secret(text) to service_role;

-- ---------------------------------------------------------------------------
-- watched_card_ids
-- ---------------------------------------------------------------------------
-- Every distinct card anyone is actively watching, once. The job batches these
-- 20 at a time, so a card three vendors are all watching costs one upstream
-- lookup, not three — the same rule the watchlist page already follows.
--
-- Deliberately returns ids and nothing else. The job has no business knowing
-- who watches what, and this is the only cross-user read in the system.
create or replace function public.watched_card_ids()
returns table (card_id text)
language sql
security definer
set search_path = ''
stable
as $$
  select distinct w.card_id
    from public.watchlist w
   where w.active
$$;

revoke execute on function public.watched_card_ids() from public;
grant execute on function public.watched_card_ids() to service_role;
