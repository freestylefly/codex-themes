-- Production migration 20260723132558.
-- Community marketplace, points wallet, creator rewards, and moderation.
-- This migration is additive: legacy Alipay theme orders and entitlements
-- remain valid, while new marketplace acquisitions use points.

-- ---------------------------------------------------------------------------
-- Profiles and server-managed roles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists handle text,
  add column if not exists display_name text,
  add column if not exists custom_avatar_url text;

create unique index if not exists idx_profiles_handle_lower
  on public.profiles (lower(handle))
  where handle is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_handle_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_handle_format
      check (handle is null or handle ~ '^[a-z0-9_]{3,24}$');
  end if;
end
$$;

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table private.admin_email_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  check (email = lower(email))
);

insert into private.admin_email_allowlist (email)
values ('canghe0818@gmail.com')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Points: packs, orders, accounts, and immutable ledger
-- ---------------------------------------------------------------------------

create table public.point_packs (
  id text primary key,
  name text not null,
  price_cents integer not null check (price_cents > 0),
  base_points integer not null check (base_points > 0),
  bonus_points integer not null default 0 check (bonus_points >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.point_packs (
  id, name, price_cents, base_points, bonus_points, sort_order
)
values
  ('starter-60', '轻量积分包', 600, 60, 0, 10),
  ('creator-330', '进阶积分包', 3000, 300, 30, 20),
  ('studio-800', '工作室积分包', 6800, 680, 120, 30)
on conflict (id) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  base_points = excluded.base_points,
  bonus_points = excluded.bonus_points,
  sort_order = excluded.sort_order,
  updated_at = now();

create table public.point_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_purchased integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.point_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null references public.point_packs(id),
  price_cents integer not null check (price_cents > 0),
  base_points integer not null check (base_points > 0),
  bonus_points integer not null default 0 check (bonus_points >= 0),
  status text not null default 'pending'
    check (status in (
      'pending', 'paid', 'closed', 'failed',
      'refund_pending', 'refunded'
    )),
  out_trade_no text not null unique,
  alipay_trade_no text,
  paid_at timestamptz,
  checkout_token_hash text,
  checkout_expires_at timestamptz,
  refund_request_no text unique,
  refund_reason text,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.point_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  entry_type text not null check (entry_type in (
    'topup', 'theme_unlock', 'creator_reward',
    'refund_hold', 'refund_reversal', 'admin_adjustment'
  )),
  idempotency_key text not null unique,
  point_order_id uuid references public.point_orders(id) on delete set null,
  theme_id text references public.theme_products(id) on delete set null,
  counterparty_user_id uuid references auth.users(id) on delete set null,
  admin_user_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create or replace function private.reject_immutable_audit_mutation()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  raise exception 'Audit rows are immutable';
end;
$$;

create trigger point_ledger_entries_are_immutable
before update or delete on public.point_ledger_entries
for each row execute function private.reject_immutable_audit_mutation();

revoke all on function private.reject_immutable_audit_mutation()
  from public, anon, authenticated;

alter table public.orders
  add column if not exists creator_id uuid
    references auth.users(id) on delete set null,
  add column if not exists creator_reward_points integer not null default 0
    check (creator_reward_points >= 0),
  add column if not exists refund_in_progress boolean not null default false,
  add column if not exists refund_attempt integer not null default 0
    check (refund_attempt >= 0);

-- ---------------------------------------------------------------------------
-- Marketplace products, submissions, and moderation audit
-- ---------------------------------------------------------------------------

alter table public.theme_products
  add column if not exists author_id uuid references public.profiles(id) on delete set null,
  add column if not exists origin text not null default 'official'
    check (origin in ('official', 'community')),
  add column if not exists price_points integer not null default 0
    check (price_points in (0, 49, 99, 199, 399)),
  add column if not exists creator_share_bps integer not null default 7000
    check (creator_share_bps between 0 and 10000),
  add column if not exists downloads_enabled boolean not null default true,
  add column if not exists unlock_count integer not null default 0
    check (unlock_count >= 0),
  add column if not exists published_at timestamptz;

update public.theme_products
set price_points = case
      when price_cents <= 0 then 0
      when price_cents < 740 then 49
      when price_cents < 1490 then 99
      when price_cents < 2990 then 199
      else 399
    end,
    origin = coalesce(origin, 'official'),
    published_at = case when published then coalesce(published_at, created_at) else published_at end
where price_points = 0 or published_at is null;

-- Normalize existing ¥9.90 catalog products to the approved 99-point tier.
update public.theme_products
set price_points = 99
where price_cents = 990;

create table public.theme_submissions (
  id uuid primary key default gen_random_uuid(),
  theme_id text not null references public.theme_products(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  revision integer not null check (revision > 0),
  version text not null,
  source_kind text not null check (source_kind in ('custom', 'ai')),
  status text not null default 'uploading'
    check (status in ('uploading', 'pending', 'approved', 'rejected', 'withdrawn', 'failed')),
  proposed_price_points integer not null
    check (proposed_price_points in (0, 49, 99, 199, 399)),
  approved_price_points integer
    check (approved_price_points in (0, 49, 99, 199, 399)),
  name text not null,
  tagline text not null default '',
  description text not null default '',
  layout text not null,
  min_engine_version text not null default '1.0.0',
  source_storage_path text not null,
  canonical_storage_path text,
  preview_storage_path text,
  preview_url text,
  sha256 text,
  rights_attested_at timestamptz not null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theme_id, revision)
);

alter table public.theme_products
  add column if not exists current_submission_id uuid
    references public.theme_submissions(id) on delete set null;

create table public.theme_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.theme_submissions(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in (
    'approve', 'reject', 'unpublish', 'republish',
    'suspend_downloads', 'restore_downloads'
  )),
  price_points integer check (price_points in (0, 49, 99, 199, 399)),
  reason text not null,
  created_at timestamptz not null default now()
);

create trigger theme_reviews_are_immutable
before update or delete on public.theme_reviews
for each row execute function private.reject_immutable_audit_mutation();

alter table public.entitlements
  add column if not exists acquisition_type text not null default 'legacy_alipay'
    check (acquisition_type in (
      'legacy_alipay', 'alipay', 'points', 'free', 'author', 'admin'
    )),
  add column if not exists points_spent integer not null default 0
    check (points_spent >= 0),
  add column if not exists creator_reward_points integer not null default 0
    check (creator_reward_points >= 0);

alter table public.payment_events
  add column if not exists point_order_id uuid
    references public.point_orders(id) on delete set null;

-- A private upload bucket accepts source packages. Approved canonical packages
-- continue to use the existing paid-themes bucket, including free community
-- themes, because access is entitlement-gated.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'theme-submissions',
  'theme-submissions',
  false,
  25165824,
  array['application/zip', 'application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public creator avatars are normalized by the trusted commerce API before
-- upload. Versioned object paths avoid stale CDN content after replacement.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index idx_user_roles_role_user on public.user_roles(role, user_id);
create index idx_point_orders_user_created
  on public.point_orders(user_id, created_at desc);
create index idx_point_orders_pending
  on public.point_orders(created_at)
  where status = 'pending';
create index idx_point_ledger_user_created
  on public.point_ledger_entries(user_id, created_at desc, id);
create index idx_point_ledger_theme
  on public.point_ledger_entries(theme_id, created_at desc)
  where theme_id is not null;
create index idx_point_ledger_order
  on public.point_ledger_entries(point_order_id)
  where point_order_id is not null;
create index idx_theme_products_origin_published
  on public.theme_products(origin, published, published_at desc, id);
create index idx_theme_products_popular
  on public.theme_products(unlock_count desc, id)
  where published = true;
create index idx_theme_products_author
  on public.theme_products(author_id, created_at desc)
  where author_id is not null;
create index idx_theme_submissions_author_created
  on public.theme_submissions(author_id, created_at desc, id);
create index idx_theme_submissions_status_created
  on public.theme_submissions(status, created_at, id);
create index idx_theme_reviews_submission_created
  on public.theme_reviews(submission_id, created_at desc);
create index idx_theme_reviews_reviewer
  on public.theme_reviews(reviewer_id, created_at desc);
create index idx_payment_events_point_order
  on public.payment_events(point_order_id)
  where point_order_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security and least-privilege grants
-- ---------------------------------------------------------------------------

alter table public.user_roles enable row level security;
alter table public.point_packs enable row level security;
alter table public.point_accounts enable row level security;
alter table public.point_orders enable row level security;
alter table public.point_ledger_entries enable row level security;
alter table public.theme_submissions enable row level security;
alter table public.theme_reviews enable row level security;
alter table private.admin_email_allowlist enable row level security;

create policy "Active point packs are publicly readable"
  on public.point_packs for select
  to anon, authenticated
  using (active = true);

create policy "Point account is viewable by owner"
  on public.point_accounts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Point orders are viewable by owner"
  on public.point_orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Point ledger is viewable by owner"
  on public.point_ledger_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Submissions are viewable by author"
  on public.theme_submissions for select
  to authenticated
  using ((select auth.uid()) = author_id);

create policy "Reviews are viewable by submission author"
  on public.theme_reviews for select
  to authenticated
  using (
    submission_id in (
      select submissions.id
      from public.theme_submissions as submissions
      where submissions.author_id = (select auth.uid())
    )
  );

revoke all on public.user_roles, public.point_packs, public.point_accounts,
  public.point_orders, public.point_ledger_entries, public.theme_submissions,
  public.theme_reviews from public, anon, authenticated;

grant select on public.point_packs to anon, authenticated;
grant select on public.point_accounts, public.point_orders,
  public.point_ledger_entries, public.theme_submissions, public.theme_reviews
  to authenticated;

grant all privileges on public.user_roles, public.point_packs,
  public.point_accounts, public.point_orders, public.point_ledger_entries,
  public.theme_submissions, public.theme_reviews to service_role;
grant all privileges on private.admin_email_allowlist to service_role;

-- ---------------------------------------------------------------------------
-- Auth bootstrap: profile, zero-balance account, and allowlisted admin role
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, 'account'), '@', 1)
  );

  insert into public.profiles (
    id, email, avatar_url, provider, display_name
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    case
      when new.raw_app_meta_data ->> 'provider' = 'github' then 'github'
      else 'email'
    end,
    left(v_display_name, 40)
  )
  on conflict (id) do update set
    email = excluded.email,
    avatar_url = excluded.avatar_url,
    provider = excluded.provider,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    updated_at = now();

  insert into public.point_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  if exists (
    select 1
    from private.admin_email_allowlist
    where email = lower(coalesce(new.email, ''))
  ) then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

insert into public.point_accounts (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
select users.id, 'admin'
from auth.users as users
join private.admin_email_allowlist as allowlist
  on allowlist.email = lower(users.email)
on conflict (user_id, role) do nothing;

-- ---------------------------------------------------------------------------
-- Privileged transaction helpers
-- ---------------------------------------------------------------------------

create or replace function public.fulfill_point_order_payment(
  p_order_id uuid,
  p_paid_at timestamptz,
  p_alipay_trade_no text
)
returns public.point_orders
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order public.point_orders;
  v_balance integer;
  v_total_points integer;
begin
  select * into v_order
  from public.point_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Point order not found';
  end if;

  if v_order.status = 'paid' then
    return v_order;
  end if;

  if v_order.status not in ('pending', 'failed') then
    raise exception 'Point order cannot be fulfilled from status %', v_order.status;
  end if;

  v_total_points := v_order.base_points + v_order.bonus_points;

  insert into public.point_accounts (user_id)
  values (v_order.user_id)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.point_accounts
  where user_id = v_order.user_id
  for update;

  update public.point_accounts
  set balance = balance + v_total_points,
      lifetime_purchased = lifetime_purchased + v_total_points,
      updated_at = now()
  where user_id = v_order.user_id
  returning balance into v_balance;

  insert into public.point_ledger_entries (
    user_id, delta, balance_after, entry_type, idempotency_key,
    point_order_id, reason
  )
  values (
    v_order.user_id,
    v_total_points,
    v_balance,
    'topup',
    'point-order-topup:' || v_order.id::text,
    v_order.id,
    '支付宝积分充值'
  )
  on conflict (idempotency_key) do nothing;

  update public.point_orders
  set status = 'paid',
      alipay_trade_no = coalesce(alipay_trade_no, p_alipay_trade_no),
      paid_at = coalesce(paid_at, p_paid_at),
      checkout_token_hash = null,
      checkout_expires_at = null,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.unlock_theme_with_points(
  p_user_id uuid,
  p_theme_id text
)
returns public.entitlements
language plpgsql
security definer set search_path = ''
as $$
declare
  v_product public.theme_products;
  v_existing public.entitlements;
  v_entitlement public.entitlements;
  v_buyer_balance integer;
  v_author_balance integer;
  v_reward integer := 0;
  v_acquisition_type text := 'free';
begin
  select * into v_product
  from public.theme_products
  where id = p_theme_id
    and published = true
    and downloads_enabled = true;

  if v_product.id is null then
    raise exception 'Theme is not available';
  end if;

  select * into v_existing
  from public.entitlements
  where user_id = p_user_id
    and theme_id = p_theme_id
    and status = 'active';

  if v_existing.id is not null then
    return v_existing;
  end if;

  insert into public.point_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if v_product.author_id is not null and v_product.author_id <> p_user_id then
    insert into public.point_accounts (user_id)
    values (v_product.author_id)
    on conflict (user_id) do nothing;
  end if;

  -- Lock every affected balance in a stable order to prevent deadlocks.
  perform 1
  from public.point_accounts
  where user_id in (p_user_id, v_product.author_id)
  order by user_id
  for update;

  -- Re-check after acquiring the account locks so concurrent requests are
  -- idempotent even before the unique entitlement constraint is evaluated.
  select * into v_existing
  from public.entitlements
  where user_id = p_user_id
    and theme_id = p_theme_id
    and status = 'active';

  if v_existing.id is not null then
    return v_existing;
  end if;

  if v_product.author_id = p_user_id then
    v_acquisition_type := 'author';
  elsif v_product.price_points > 0 then
    v_acquisition_type := 'points';

    select balance into v_buyer_balance
    from public.point_accounts
    where user_id = p_user_id;

    if v_buyer_balance < v_product.price_points then
      raise exception 'Insufficient points';
    end if;

    update public.point_accounts
    set balance = balance - v_product.price_points,
        lifetime_spent = lifetime_spent + v_product.price_points,
        updated_at = now()
    where user_id = p_user_id
    returning balance into v_buyer_balance;

    insert into public.point_ledger_entries (
      user_id, delta, balance_after, entry_type, idempotency_key,
      theme_id, counterparty_user_id, reason
    )
    values (
      p_user_id,
      -v_product.price_points,
      v_buyer_balance,
      'theme_unlock',
      'theme-unlock:' || p_user_id::text || ':' || p_theme_id,
      p_theme_id,
      v_product.author_id,
      '积分解锁主题'
    );

    if v_product.author_id is not null then
      v_reward := floor(
        v_product.price_points::numeric * v_product.creator_share_bps / 10000
      )::integer;

      if v_reward > 0 then
        update public.point_accounts
        set balance = balance + v_reward,
            lifetime_earned = lifetime_earned + v_reward,
            updated_at = now()
        where user_id = v_product.author_id
        returning balance into v_author_balance;

        insert into public.point_ledger_entries (
          user_id, delta, balance_after, entry_type, idempotency_key,
          theme_id, counterparty_user_id, reason
        )
        values (
          v_product.author_id,
          v_reward,
          v_author_balance,
          'creator_reward',
          'creator-reward:' || p_user_id::text || ':' || p_theme_id,
          p_theme_id,
          p_user_id,
          '主题首次解锁作者分成'
        );
      end if;
    end if;
  end if;

  insert into public.entitlements (
    user_id, theme_id, version, status, acquisition_type,
    points_spent, creator_reward_points
  )
  values (
    p_user_id,
    p_theme_id,
    v_product.version,
    'active',
    v_acquisition_type,
    case when v_acquisition_type = 'points' then v_product.price_points else 0 end,
    v_reward
  )
  on conflict (user_id, theme_id) do update set
    version = excluded.version,
    status = 'active',
    acquisition_type = excluded.acquisition_type,
    points_spent = excluded.points_spent,
    creator_reward_points = excluded.creator_reward_points,
    updated_at = now()
  returning * into v_entitlement;

  update public.theme_products
  set unlock_count = unlock_count + 1,
      updated_at = now()
  where id = p_theme_id;

  return v_entitlement;
end;
$$;

create or replace function public.adjust_point_balance(
  p_admin_id uuid,
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_idempotency_key text
)
returns public.point_accounts
language plpgsql
security definer set search_path = ''
as $$
declare
  v_account public.point_accounts;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  if p_delta = 0 or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Adjustment amount and reason are required';
  end if;

  insert into public.point_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.point_accounts
  where user_id = p_user_id
  for update;

  if v_account.balance + p_delta < 0 then
    raise exception 'Adjustment would make balance negative';
  end if;

  update public.point_accounts
  set balance = balance + p_delta,
      updated_at = now()
  where user_id = p_user_id
  returning * into v_account;

  insert into public.point_ledger_entries (
    user_id, delta, balance_after, entry_type, idempotency_key,
    admin_user_id, reason
  )
  values (
    p_user_id,
    p_delta,
    v_account.balance,
    'admin_adjustment',
    p_idempotency_key,
    p_admin_id,
    trim(p_reason)
  );

  return v_account;
end;
$$;

create or replace function public.begin_point_order_refund(
  p_order_id uuid,
  p_admin_id uuid,
  p_out_request_no text,
  p_reason text
)
returns public.point_orders
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order public.point_orders;
  v_balance integer;
  v_total_points integer;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  select * into v_order
  from public.point_orders
  where id = p_order_id
  for update;

  if v_order.id is null or v_order.status <> 'paid' then
    raise exception 'Only paid point orders can be refunded';
  end if;

  v_total_points := v_order.base_points + v_order.bonus_points;

  select balance into v_balance
  from public.point_accounts
  where user_id = v_order.user_id
  for update;

  if v_balance < v_total_points then
    raise exception 'Purchased points have already been consumed';
  end if;

  update public.point_accounts
  set balance = balance - v_total_points,
      updated_at = now()
  where user_id = v_order.user_id
  returning balance into v_balance;

  insert into public.point_ledger_entries (
    user_id, delta, balance_after, entry_type, idempotency_key,
    point_order_id, admin_user_id, reason
  )
  values (
    v_order.user_id,
    -v_total_points,
    v_balance,
    'refund_hold',
    'point-order-refund-hold:' || v_order.id::text || ':' || p_out_request_no,
    v_order.id,
    p_admin_id,
    trim(p_reason)
  );

  update public.point_orders
  set status = 'refund_pending',
      refund_request_no = p_out_request_no,
      refund_reason = trim(p_reason),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.complete_point_order_refund(
  p_order_id uuid,
  p_success boolean
)
returns public.point_orders
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order public.point_orders;
  v_balance integer;
  v_total_points integer;
begin
  select * into v_order
  from public.point_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Point order not found';
  end if;

  if v_order.status = 'refunded' then
    return v_order;
  end if;

  if v_order.status <> 'refund_pending' then
    raise exception 'Point order is not awaiting a refund';
  end if;

  if p_success then
    update public.point_orders
    set status = 'refunded',
        refunded_at = now(),
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
    return v_order;
  end if;

  v_total_points := v_order.base_points + v_order.bonus_points;

  select balance into v_balance
  from public.point_accounts
  where user_id = v_order.user_id
  for update;

  update public.point_accounts
  set balance = balance + v_total_points,
      updated_at = now()
  where user_id = v_order.user_id
  returning balance into v_balance;

  insert into public.point_ledger_entries (
    user_id, delta, balance_after, entry_type, idempotency_key,
    point_order_id, reason
  )
  values (
    v_order.user_id,
    v_total_points,
    v_balance,
    'refund_reversal',
    'point-order-refund-reversal:' || v_order.id::text || ':' || v_order.refund_request_no,
    v_order.id,
    '支付宝退款失败，积分退回'
  )
  on conflict (idempotency_key) do nothing;

  update public.point_orders
  set status = 'paid',
      refund_request_no = null,
      refund_reason = null,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.review_theme_submission(
  p_submission_id uuid,
  p_admin_id uuid,
  p_action text,
  p_price_points integer,
  p_reason text
)
returns public.theme_submissions
language plpgsql
security definer set search_path = ''
as $$
declare
  v_submission public.theme_submissions;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  if p_action not in ('approve', 'reject') then
    raise exception 'Invalid review action';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception 'Review reason is required';
  end if;

  select * into v_submission
  from public.theme_submissions
  where id = p_submission_id
  for update;

  if v_submission.id is null or v_submission.status <> 'pending' then
    raise exception 'Submission is not pending';
  end if;

  if p_action = 'reject' then
    update public.theme_submissions
    set status = 'rejected',
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_reason = trim(p_reason),
        updated_at = now()
    where id = v_submission.id
    returning * into v_submission;
  else
    if p_price_points not in (0, 49, 99, 199, 399) then
      raise exception 'Invalid point price';
    end if;

    if v_submission.canonical_storage_path is null
      or v_submission.preview_url is null
      or v_submission.sha256 is null then
      raise exception 'Submission has not completed server validation';
    end if;

    update public.theme_submissions
    set status = 'approved',
        approved_price_points = p_price_points,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_reason = trim(p_reason),
        updated_at = now()
    where id = v_submission.id
    returning * into v_submission;

    update public.theme_products
    set name = v_submission.name,
        tagline = v_submission.tagline,
        description = v_submission.description,
        version = v_submission.version,
        layout = v_submission.layout,
        min_engine_version = v_submission.min_engine_version,
        preview_url = v_submission.preview_url,
        price_cents = p_price_points * 10,
        price_points = p_price_points,
        origin = 'community',
        author_id = v_submission.author_id,
        current_submission_id = v_submission.id,
        published = true,
        downloads_enabled = true,
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = v_submission.theme_id;

    insert into private.theme_assets (
      theme_id, storage_path, sha256
    )
    values (
      v_submission.theme_id,
      v_submission.canonical_storage_path,
      v_submission.sha256
    )
    on conflict (theme_id) do update set
      storage_path = excluded.storage_path,
      sha256 = excluded.sha256,
      updated_at = now();

    insert into public.entitlements (
      user_id, theme_id, version, status, acquisition_type,
      points_spent, creator_reward_points
    )
    values (
      v_submission.author_id,
      v_submission.theme_id,
      v_submission.version,
      'active',
      'author',
      0,
      0
    )
    on conflict (user_id, theme_id) do update set
      version = excluded.version,
      status = 'active',
      acquisition_type = 'author',
      updated_at = now();
  end if;

  insert into public.theme_reviews (
    submission_id, reviewer_id, action, price_points, reason
  )
  values (
    v_submission.id,
    p_admin_id,
    p_action,
    case when p_action = 'approve' then p_price_points else null end,
    trim(p_reason)
  );

  return v_submission;
end;
$$;

-- New direct Alipay purchases remain available alongside point unlocks.
-- Buyer/creator accounts are locked in the same UUID order as point unlocks,
-- so the two payment paths cannot settle one entitlement twice.
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
  v_existing public.entitlements;
  v_creator_balance integer;
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
  if v_order.status = 'refunded' then
    raise exception 'Refunded order cannot be fulfilled';
  end if;

  insert into public.point_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  if v_order.creator_id is not null and v_order.creator_id <> p_user_id then
    insert into public.point_accounts (user_id)
    values (v_order.creator_id)
    on conflict (user_id) do nothing;
  end if;

  perform 1
  from public.point_accounts
  where user_id in (p_user_id, v_order.creator_id)
  order by user_id
  for update;

  select * into v_existing
  from public.entitlements
  where user_id = p_user_id
    and theme_id = p_theme_id
    and status = 'active';

  if v_existing.id is null then
    if v_order.creator_id is not null
      and v_order.creator_id <> p_user_id
      and v_order.creator_reward_points > 0 then
      update public.point_accounts
      set balance = balance + v_order.creator_reward_points,
          lifetime_earned = lifetime_earned + v_order.creator_reward_points,
          updated_at = now()
      where user_id = v_order.creator_id
      returning balance into v_creator_balance;

      insert into public.point_ledger_entries (
        user_id, delta, balance_after, entry_type, idempotency_key,
        theme_id, counterparty_user_id, reason
      )
      values (
        v_order.creator_id,
        v_order.creator_reward_points,
        v_creator_balance,
        'creator_reward',
        'alipay-creator-reward:' || v_order.id::text,
        p_theme_id,
        p_user_id,
        '支付宝购买主题作者分成'
      );
    end if;

    insert into public.entitlements (
      user_id, theme_id, version, status, acquisition_type,
      points_spent, creator_reward_points
    )
    values (
      p_user_id,
      p_theme_id,
      p_version,
      'active',
      'alipay',
      0,
      v_order.creator_reward_points
    )
    on conflict (user_id, theme_id) do update set
      version = excluded.version,
      status = 'active',
      acquisition_type = excluded.acquisition_type,
      points_spent = 0,
      creator_reward_points = excluded.creator_reward_points,
      updated_at = now();

    update public.theme_products
    set unlock_count = unlock_count + 1,
        updated_at = now()
    where id = p_theme_id;
  else
    -- A second Alipay order or a concurrent point unlock already owns the
    -- entitlement, so this paid order must not claim/refund an author reward.
    update public.orders
    set creator_reward_points = 0
    where id = v_order.id;
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

  return v_order;
end;
$$;

create or replace function public.begin_theme_order_refund(
  p_order_id uuid,
  p_user_id uuid,
  p_reason text
)
returns public.orders
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_creator_balance integer;
  v_attempt integer;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null or v_order.user_id <> p_user_id then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Only paid orders can be refunded';
  end if;
  if v_order.refund_in_progress then
    raise exception 'Order refund is already in progress';
  end if;
  v_attempt := v_order.refund_attempt + 1;

  if v_order.creator_id is not null and v_order.creator_reward_points > 0 then
    select balance into v_creator_balance
    from public.point_accounts
    where user_id = v_order.creator_id
    for update;
    if v_creator_balance < v_order.creator_reward_points then
      raise exception 'Creator reward points have already been consumed';
    end if;

    update public.point_accounts
    set balance = balance - v_order.creator_reward_points,
        updated_at = now()
    where user_id = v_order.creator_id
    returning balance into v_creator_balance;

    insert into public.point_ledger_entries (
      user_id, delta, balance_after, entry_type, idempotency_key,
      theme_id, counterparty_user_id, reason
    )
    values (
      v_order.creator_id,
      -v_order.creator_reward_points,
      v_creator_balance,
      'refund_hold',
      'theme-order-refund-hold:' || v_order.id::text || ':' || v_attempt::text,
      v_order.theme_id,
      v_order.user_id,
      trim(p_reason)
    );
  end if;

  update public.orders
  set refund_in_progress = true,
      refund_attempt = v_attempt,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.complete_theme_order_refund(
  p_order_id uuid,
  p_success boolean
)
returns public.orders
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_creator_balance integer;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.status = 'refunded' then return v_order; end if;
  if v_order.status <> 'paid' or not v_order.refund_in_progress then
    raise exception 'Order is not awaiting a refund';
  end if;

  if p_success then
    update public.orders
    set status = 'refunded', refund_in_progress = false, updated_at = now()
    where id = v_order.id
    returning * into v_order;
    update public.entitlements
    set status = 'revoked', updated_at = now()
    where user_id = v_order.user_id
      and theme_id = v_order.theme_id
      and acquisition_type in ('alipay', 'legacy_alipay');
    if found then
      update public.theme_products
      set unlock_count = greatest(unlock_count - 1, 0),
          updated_at = now()
      where id = v_order.theme_id;
    end if;
    return v_order;
  end if;

  if v_order.creator_id is not null and v_order.creator_reward_points > 0 then
    select balance into v_creator_balance
    from public.point_accounts
    where user_id = v_order.creator_id
    for update;
    update public.point_accounts
    set balance = balance + v_order.creator_reward_points,
        updated_at = now()
    where user_id = v_order.creator_id
    returning balance into v_creator_balance;
    insert into public.point_ledger_entries (
      user_id, delta, balance_after, entry_type, idempotency_key,
      theme_id, counterparty_user_id, reason
    )
    values (
      v_order.creator_id,
      v_order.creator_reward_points,
      v_creator_balance,
      'refund_reversal',
      'theme-order-refund-reversal:' || v_order.id::text || ':' || v_order.refund_attempt::text,
      v_order.theme_id,
      v_order.user_id,
      '支付宝主题退款失败，作者奖励冲回'
    )
    on conflict (idempotency_key) do nothing;
  end if;

  update public.orders
  set refund_in_progress = false, updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;

-- Every privileged RPC is server-only. Keep the functions in the exposed
-- schema solely because the Vercel service uses PostgREST RPC.
revoke all on function public.fulfill_point_order_payment(uuid, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.unlock_theme_with_points(uuid, text)
  from public, anon, authenticated;
revoke all on function public.adjust_point_balance(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.begin_point_order_refund(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_point_order_refund(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.review_theme_submission(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.fulfill_order_payment(uuid, uuid, text, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.begin_theme_order_refund(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_theme_order_refund(uuid, boolean)
  from public, anon, authenticated;
-- Superseded by the pre-hold refund flow above; keep the legacy function for
-- migration compatibility but make it unreachable to the API service.
revoke all on function public.refund_order_payment(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.fulfill_point_order_payment(uuid, timestamptz, text)
  to service_role;
grant execute on function public.unlock_theme_with_points(uuid, text)
  to service_role;
grant execute on function public.adjust_point_balance(uuid, uuid, integer, text, text)
  to service_role;
grant execute on function public.begin_point_order_refund(uuid, uuid, text, text)
  to service_role;
grant execute on function public.complete_point_order_refund(uuid, boolean)
  to service_role;
grant execute on function public.review_theme_submission(uuid, uuid, text, integer, text)
  to service_role;
grant execute on function public.fulfill_order_payment(uuid, uuid, text, text, timestamptz, text)
  to service_role;
grant execute on function public.begin_theme_order_refund(uuid, uuid, text)
  to service_role;
grant execute on function public.complete_theme_order_refund(uuid, boolean)
  to service_role;

-- Fix the current database advisor warning: this event-trigger helper is not
-- a Data API endpoint and must never be directly executable by client roles.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
