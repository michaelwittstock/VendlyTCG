-- Market price at the moment the watch was created, captured from the search
-- result we already had in hand. Lets the UI show "down $12 since you added
-- it" without a price-history table or a write on every page load.
-- Null is legitimate: the card had no published price when it was added.
alter table public.watchlist
  add column market_at_add numeric(10,2)
    check (market_at_add is null or (market_at_add > 0 and market_at_add <= 1000000));
