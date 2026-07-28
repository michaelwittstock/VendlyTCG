-- Watchlist v1: cards a vendor is hunting, with a buy-under target.
-- Target is either an absolute dollar ceiling or a % under current market.
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,

  -- Pinned to a specific card in the price provider, not a free-text name.
  -- A name is ambiguous across sets and reprints; the id is not.
  card_id     text not null,
  card_name   text not null,
  set_name    text,
  card_number text,
  rarity      text,
  image_url   text,

  -- Which printing's price to judge against. NULL = "whichever finish is
  -- worth the most", which is what you want when you have not decided yet.
  -- Holo vs reverse holo vs normal are wildly different money; averaging
  -- them would produce a target that is wrong for every one of them.
  finish text,

  target_kind  text not null default 'percent'
    check (target_kind in ('price', 'percent')),
  target_price numeric(10,2),
  target_pct   numeric(5,2),

  notes  text,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint watchlist_target_shape check (
    (target_kind = 'price'
       and target_price is not null and target_price > 0 and target_pct is null)
    or
    (target_kind = 'percent'
       and target_pct is not null and target_pct >= 0 and target_pct <= 95
       and target_price is null)
  ),
  constraint watchlist_card_id_len   check (char_length(card_id)   between 1 and 64),
  constraint watchlist_card_name_len check (char_length(card_name) between 1 and 200),
  constraint watchlist_finish_len    check (finish is null or char_length(finish) <= 40),
  constraint watchlist_notes_len     check (notes  is null or char_length(notes)  <= 500),
  constraint watchlist_target_price_sane check (target_price is null or target_price <= 1000000)
);

-- One watch per card+finish per user. Re-adding the same card should update
-- the target, not silently create a second row that quietly contradicts it.
create unique index watchlist_user_card_finish_uniq
  on public.watchlist (user_id, card_id, coalesce(finish, ''));

create index watchlist_user_created_idx
  on public.watchlist (user_id, created_at desc);

alter table public.watchlist enable row level security;

create policy watchlist_own on public.watchlist
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger watchlist_touch_updated_at
  before update on public.watchlist
  for each row execute function public.touch_updated_at();
