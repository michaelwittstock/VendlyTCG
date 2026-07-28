-- Show mode: sales logged with no signal are queued on the device and synced
-- later. Sync retries must never double-log, so every queued sale carries an
-- idempotency key generated on the device.

alter table public.sales
  add column if not exists client_ref uuid;

comment on column public.sales.client_ref is
  'Idempotency key generated on the device for sales logged offline in Show mode. NULL for sales logged online. Unique per user, so re-syncing a queue cannot create a second row for the same sale.';

create unique index if not exists sales_user_client_ref_key
  on public.sales (user_id, client_ref)
  where client_ref is not null;

-- Deliberately a NEW function rather than a change to log_sale(). log_sale is
-- what the already-deployed production Sales page calls; dropping or
-- re-signing it would break live code that is not behind the pending merge.

create or replace function public.log_sale_queued(
  p_client_ref uuid,
  p_item_id uuid default null,
  p_item_name text default null,
  p_category text default 'other',
  p_quantity integer default 1,
  p_sale_price numeric default 0,
  p_cost_basis numeric default 0,
  p_fees numeric default 0,
  p_channel text default 'show',
  p_customer_id uuid default null,
  p_show_id uuid default null,
  p_sold_at timestamptz default now(),
  p_notes text default null
)
returns table (sale_id uuid, oversold boolean, duplicate boolean)
language plpgsql
set search_path to 'public'
as $$
declare
  v_item public.inventory_items%rowtype;
  v_existing uuid;
  v_sale_id uuid;
  v_name text;
  v_category text;
  v_cost numeric;
  v_take integer;
  v_oversold boolean := false;
begin
  if p_client_ref is null then
    raise exception 'client_ref is required';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  -- Landed on an earlier attempt. Report it and change nothing.
  select id into v_existing
    from public.sales
   where client_ref = p_client_ref and user_id = auth.uid();
  if found then
    return query select v_existing, false, true;
    return;
  end if;

  if p_item_id is not null then
    select * into v_item from public.inventory_items where id = p_item_id for update;
    if not found then
      raise exception 'Item not found';
    end if;
    v_name := v_item.name;
    v_category := v_item.category;
    v_cost := v_item.cost_basis;
    -- The sale already happened at a table. If the stock count disagrees, the
    -- count is what is wrong. Record the money, floor the count at zero and
    -- flag it, rather than reject a sale that really occurred.
    if v_item.quantity < p_quantity then
      v_oversold := true;
    end if;
    v_take := least(v_item.quantity, p_quantity);
  else
    if p_item_name is null or btrim(p_item_name) = '' then
      raise exception 'A sale needs either an inventory item or a name';
    end if;
    v_name := btrim(p_item_name);
    v_category := coalesce(p_category, 'other');
    v_cost := coalesce(p_cost_basis, 0);
  end if;

  insert into public.sales
    (client_ref, item_id, customer_id, show_id, item_name, category, quantity,
     sale_price, cost_basis, fees, channel, sold_at, notes)
  values
    (p_client_ref, p_item_id, p_customer_id, p_show_id, v_name, v_category, p_quantity,
     coalesce(p_sale_price, 0), coalesce(v_cost, 0), coalesce(p_fees, 0),
     coalesce(p_channel, 'show'), coalesce(p_sold_at, now()), p_notes)
  returning id into v_sale_id;

  if p_item_id is not null then
    update public.inventory_items
       set quantity = quantity - v_take,
           status = case when quantity - v_take = 0 then 'sold_out' else status end
     where id = p_item_id;
  end if;

  return query select v_sale_id, v_oversold, false;

exception
  -- Two devices (or two tabs) syncing the same queue at once. The index is the
  -- real guard; this turns the race into the same answer as the check above.
  when unique_violation then
    select id into v_existing
      from public.sales
     where client_ref = p_client_ref and user_id = auth.uid();
    return query select v_existing, false, true;
end;
$$;
