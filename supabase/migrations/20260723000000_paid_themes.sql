-- Paid themes schema: users, products, orders, entitlements, and audit events.
-- This migration assumes the Supabase Auth extension is already enabled.

-- ---------------------------------------------------------------------------
-- Profiles (public read of own row)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  avatar_url text,
  provider text not null default 'email' check (provider in ('email', 'github')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Publicly readable user profile linked to auth.users.';

-- Sync profile from auth user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, avatar_url, provider)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do update set
    email = excluded.email,
    avatar_url = excluded.avatar_url,
    provider = excluded.provider,
    updated_at = now();
  return new;
end;
$$;

-- Trigger-only function: never expose it as a callable Data API RPC.
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Theme products (public catalog)
-- ---------------------------------------------------------------------------
create table public.theme_products (
  id text primary key,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  version text not null default '1.0.0',
  layout text not null,
  preview_url text not null,
  price_cents integer not null check (price_cents >= 0),
  min_engine_version text not null default '1.0.0',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.theme_products is 'Publicly listed paid themes with pricing metadata.';

-- ---------------------------------------------------------------------------
-- Orders (private to owner; writes only by service role)
-- ---------------------------------------------------------------------------
create type public.order_status as enum ('pending', 'paid', 'closed', 'failed', 'refunded');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_id text not null references public.theme_products(id),
  price_cents integer not null check (price_cents >= 0),
  status public.order_status not null default 'pending',
  out_trade_no text not null unique,
  alipay_trade_no text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is 'Purchase orders; only the owner can read, only service role can write.';

-- ---------------------------------------------------------------------------
-- Entitlements (private to owner; writes only by service role)
-- ---------------------------------------------------------------------------
create type public.entitlement_status as enum ('active', 'revoked');

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_id text not null references public.theme_products(id),
  version text not null,
  status public.entitlement_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, theme_id)
);

comment on table public.entitlements is 'Themes a user owns; service-role writes only.';

-- ---------------------------------------------------------------------------
-- Payment events (service-role readable only)
-- ---------------------------------------------------------------------------
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.payment_events is 'Idempotency/audit log for Alipay notifications and reconciliations.';

-- ---------------------------------------------------------------------------
-- Private asset registry (Storage paths; never exposed via Data API)
-- ---------------------------------------------------------------------------
create schema if not exists private;

create table private.theme_assets (
  theme_id text primary key references public.theme_products(id) on delete cascade,
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table private.theme_assets is 'Internal Storage path and checksum for paid theme packages.';

-- Private package bucket. Only the server-side secret/service role accesses it.
insert into storage.buckets (id, name, public)
values ('paid-themes', 'paid-themes', false)
on conflict (id) do update set public = false;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.theme_products enable row level security;
alter table public.orders enable row level security;
alter table public.entitlements enable row level security;
alter table public.payment_events enable row level security;
alter table private.theme_assets enable row level security;

-- Profiles: users can read their own row.
create policy "Profiles are viewable by owner"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Theme products: anyone can read published products.
create policy "Published products are publicly readable"
  on public.theme_products for select
  to anon, authenticated
  using (published = true);

-- Orders: users can read their own orders only.
create policy "Orders are viewable by owner"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Entitlements: users can read their own entitlements only.
create policy "Entitlements are viewable by owner"
  on public.entitlements for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Payment events: no direct client access; service role bypasses RLS.
create policy "Payment events are not client readable"
  on public.payment_events for select
  to anon, authenticated
  using (false);

-- Private theme assets: no direct client access; service role bypasses RLS.
create policy "Theme assets are not client readable"
  on private.theme_assets for select
  to anon, authenticated
  using (false);

-- All client-side writes are blocked; service role performs order/entitlement writes.
create policy "Client cannot insert orders"
  on public.orders for insert
  to anon, authenticated
  with check (false);

create policy "Client cannot update orders"
  on public.orders for update
  to anon, authenticated
  using (false);

create policy "Client cannot insert entitlements"
  on public.entitlements for insert
  to anon, authenticated
  with check (false);

create policy "Client cannot update entitlements"
  on public.entitlements for update
  to anon, authenticated
  using (false);

-- New Supabase projects can disable automatic Data API grants. Grant only the
-- operations each public role needs; privileged writes stay server-only.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.theme_products to anon, authenticated;
grant select on public.profiles, public.orders, public.entitlements to authenticated;
grant all privileges on public.profiles, public.theme_products, public.orders,
  public.entitlements, public.payment_events to service_role;
grant usage on schema private to service_role;
grant all privileges on private.theme_assets to service_role;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_orders_user_id on public.orders(user_id);
create index idx_orders_out_trade_no on public.orders(out_trade_no);
create index idx_orders_status on public.orders(status);
create index idx_entitlements_user_id on public.entitlements(user_id);
create index idx_payment_events_order_id on public.payment_events(order_id);

-- ---------------------------------------------------------------------------
-- Service-role helper: atomically fulfill a paid order and grant entitlement
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_order(
  p_order_id uuid,
  p_user_id uuid,
  p_theme_id text,
  p_version text,
  p_paid_at timestamptz
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

  if v_order.status = 'paid' then
    return v_order;
  end if;

  update public.orders
  set status = 'paid',
      paid_at = p_paid_at,
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

-- This privileged RPC is callable only by the backend service role.
revoke all on function public.fulfill_order(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fulfill_order(uuid, uuid, text, text, timestamptz)
  to service_role;

-- Keep the private schema out of the Data API exposed-schemas list. The
-- backend reaches the asset registry only through these service-role RPCs.
create or replace function public.upsert_theme_asset(
  p_theme_id text,
  p_storage_path text,
  p_sha256 text
)
returns void
language sql
security definer set search_path = ''
as $$
  insert into private.theme_assets (theme_id, storage_path, sha256)
  values (p_theme_id, p_storage_path, p_sha256)
  on conflict (theme_id) do update set
    storage_path = excluded.storage_path,
    sha256 = excluded.sha256,
    updated_at = now();
$$;

create or replace function public.get_theme_asset(p_theme_id text)
returns table (storage_path text, sha256 text)
language sql
security definer set search_path = ''
stable
as $$
  select assets.storage_path, assets.sha256
  from private.theme_assets as assets
  where assets.theme_id = p_theme_id;
$$;

revoke all on function public.upsert_theme_asset(text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_theme_asset(text)
  from public, anon, authenticated;
grant execute on function public.upsert_theme_asset(text, text, text)
  to service_role;
grant execute on function public.get_theme_asset(text)
  to service_role;
