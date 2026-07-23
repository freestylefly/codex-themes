-- Production migration 20260723041104.
-- Complete Alipay website-payment support: secure checkout links, notification
-- idempotency, refunds, close/query support, and atomic entitlement changes.

alter table public.orders
  add column if not exists checkout_token_hash text,
  add column if not exists checkout_expires_at timestamptz;

alter table public.payment_events
  add column if not exists notify_id text;

create unique index if not exists idx_payment_events_notify_id
  on public.payment_events(notify_id);

create index if not exists idx_orders_theme_id on public.orders(theme_id);
create index if not exists idx_entitlements_theme_id on public.entitlements(theme_id);
create index if not exists idx_orders_checkout_token_hash
  on public.orders(checkout_token_hash)
  where checkout_token_hash is not null;

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  out_request_no text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'requested'
    check (status in ('requested', 'succeeded', 'failed')),
  alipay_result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.refund_requests enable row level security;

create policy "Refund requests are viewable by owner"
  on public.refund_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Client cannot insert refund requests"
  on public.refund_requests for insert
  to anon, authenticated
  with check (false);

create policy "Client cannot update refund requests"
  on public.refund_requests for update
  to anon, authenticated
  using (false);

grant select on public.refund_requests to authenticated;
grant all privileges on public.refund_requests to service_role;

create index if not exists idx_refund_requests_order_id
  on public.refund_requests(order_id);
create index if not exists idx_refund_requests_user_id
  on public.refund_requests(user_id);

create or replace function public.fulfill_order_payment(
  p_order_id uuid,
  p_user_id uuid,
  p_theme_id text,
  p_version text,
  p_paid_at timestamptz,
  p_alipay_trade_no text
)
returns public.orders
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if v_order.user_id <> p_user_id or v_order.theme_id <> p_theme_id then
    raise exception 'Order ownership or theme mismatch';
  end if;

  if v_order.status = 'refunded' then
    raise exception 'Refunded order cannot be fulfilled';
  end if;

  update public.orders
  set status = 'paid',
      alipay_trade_no = coalesce(alipay_trade_no, p_alipay_trade_no),
      paid_at = coalesce(paid_at, p_paid_at),
      checkout_token_hash = null,
      checkout_expires_at = null,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.entitlements (user_id, theme_id, version, status)
  values (p_user_id, p_theme_id, p_version, 'active')
  on conflict (user_id, theme_id)
  do update set
    version = excluded.version,
    status = 'active',
    updated_at = now();

  return v_order;
end;
$$;

revoke all on function public.fulfill_order_payment(uuid, uuid, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.fulfill_order_payment(uuid, uuid, text, text, timestamptz, text)
  to service_role;

create or replace function public.refund_order_payment(
  p_order_id uuid,
  p_user_id uuid,
  p_out_request_no text,
  p_result jsonb
)
returns public.orders
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null or v_order.user_id <> p_user_id then
    raise exception 'Order not found or ownership mismatch';
  end if;

  if v_order.status = 'refunded' then
    return v_order;
  end if;

  if v_order.status <> 'paid' then
    raise exception 'Only paid orders can be refunded';
  end if;

  insert into public.refund_requests (
    order_id, user_id, out_request_no, amount_cents, status, alipay_result
  )
  values (
    v_order.id, v_order.user_id, p_out_request_no, v_order.price_cents, 'succeeded', p_result
  )
  on conflict (out_request_no) do update set
    status = 'succeeded',
    alipay_result = excluded.alipay_result,
    updated_at = now();

  update public.orders
  set status = 'refunded',
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  update public.entitlements
  set status = 'revoked',
      updated_at = now()
  where user_id = v_order.user_id
    and theme_id = v_order.theme_id;

  return v_order;
end;
$$;

revoke all on function public.refund_order_payment(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.refund_order_payment(uuid, uuid, text, jsonb)
  to service_role;
