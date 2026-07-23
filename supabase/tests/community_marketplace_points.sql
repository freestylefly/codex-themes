-- Run after 20260723092358_community_marketplace_points.sql.
-- Every fixture is rolled back. Any failed assertion aborts the script.
begin;

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
values
  ('00000000-0000-4000-8000-00000000a001', 'points-buyer@example.test', 'authenticated', 'authenticated', '{"provider":"email"}', '{}', now(), now(), false, false),
  ('00000000-0000-4000-8000-00000000b001', 'points-author@example.test', 'authenticated', 'authenticated', '{"provider":"email"}', '{}', now(), now(), false, false),
  ('00000000-0000-4000-8000-00000000c001', 'points-admin@example.test', 'authenticated', 'authenticated', '{"provider":"email"}', '{}', now(), now(), false, false);

update public.profiles
set handle = case id
  when '00000000-0000-4000-8000-00000000a001' then 'test_buyer'
  when '00000000-0000-4000-8000-00000000b001' then 'test_author'
  else 'test_admin'
end
where id in (
  '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000c001'
);

insert into public.user_roles (user_id, role)
values ('00000000-0000-4000-8000-00000000c001', 'admin');

insert into public.theme_products (
  id, name, tagline, description, version, layout, preview_url,
  price_cents, price_points, min_engine_version, published, origin,
  author_id, creator_share_bps, downloads_enabled, published_at
)
values
  ('community-sql-paid', 'Paid', '', '', '1.0.0', 'dream-banner', 'https://example.test/paid.webp', 0, 49, '1.0.0', true, 'community', '00000000-0000-4000-8000-00000000b001', 7000, true, now()),
  ('community-sql-free', 'Free', '', '', '1.0.0', 'dream-banner', 'https://example.test/free.webp', 0, 0, '1.0.0', true, 'community', '00000000-0000-4000-8000-00000000b001', 7000, true, now()),
  ('community-sql-expensive', 'Expensive', '', '', '1.0.0', 'dream-banner', 'https://example.test/expensive.webp', 0, 399, '1.0.0', true, 'community', '00000000-0000-4000-8000-00000000b001', 7000, true, now());

insert into public.point_orders (
  id, user_id, pack_id, price_cents, base_points, bonus_points,
  status, out_trade_no
)
values (
  '10000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000a001',
  'starter-60', 600, 60, 0, 'pending', 'ctp-sql-buyer'
);

select public.fulfill_point_order_payment(
  '10000000-0000-4000-8000-00000000a001', now(), 'sql-trade-buyer'
);
-- Duplicate delivery must not credit twice.
select public.fulfill_point_order_payment(
  '10000000-0000-4000-8000-00000000a001', now(), 'sql-trade-buyer'
);

select public.unlock_theme_with_points(
  '00000000-0000-4000-8000-00000000a001', 'community-sql-paid'
);
-- Duplicate unlock/download/application path must not settle twice.
select public.unlock_theme_with_points(
  '00000000-0000-4000-8000-00000000a001', 'community-sql-paid'
);
select public.unlock_theme_with_points(
  '00000000-0000-4000-8000-00000000a001', 'community-sql-free'
);
-- Author self-unlock creates entitlement without a debit or reward.
select public.unlock_theme_with_points(
  '00000000-0000-4000-8000-00000000b001', 'community-sql-paid'
);

do $$
declare
  v_buyer integer;
  v_author integer;
  v_count integer;
begin
  select balance into v_buyer from public.point_accounts
  where user_id = '00000000-0000-4000-8000-00000000a001';
  select balance into v_author from public.point_accounts
  where user_id = '00000000-0000-4000-8000-00000000b001';
  if v_buyer <> 11 then raise exception 'buyer expected 11 points, got %', v_buyer; end if;
  if v_author <> 34 then raise exception '70%% floor reward expected 34, got %', v_author; end if;

  select count(*) into v_count from public.point_ledger_entries
  where idempotency_key = 'point-order-topup:10000000-0000-4000-8000-00000000a001';
  if v_count <> 1 then raise exception 'duplicate payment credited more than once'; end if;
  select count(*) into v_count from public.point_ledger_entries
  where idempotency_key = 'theme-unlock:00000000-0000-4000-8000-00000000a001:community-sql-paid';
  if v_count <> 1 then raise exception 'duplicate unlock charged more than once'; end if;
  select count(*) into v_count from public.point_ledger_entries
  where theme_id = 'community-sql-free';
  if v_count <> 0 then raise exception 'free theme unexpectedly generated ledger entries'; end if;
  select unlock_count into v_count from public.theme_products where id = 'community-sql-paid';
  if v_count <> 2 then raise exception 'unique unlock count expected buyer + author'; end if;
end
$$;

do $$
begin
  begin
    perform public.unlock_theme_with_points(
      '00000000-0000-4000-8000-00000000c001', 'community-sql-expensive'
    );
    raise exception 'insufficient balance was not rejected';
  exception
    when others then
      if sqlerrm not like '%Insufficient points%' then raise; end if;
  end;
end
$$;

insert into public.orders (
  id, user_id, theme_id, price_cents, status, out_trade_no,
  creator_id, creator_reward_points
)
values (
  '20000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000c001',
  'community-sql-paid',
  490,
  'pending',
  'ct-sql-direct',
  '00000000-0000-4000-8000-00000000b001',
  34
);
select public.fulfill_order_payment(
  '20000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000c001',
  'community-sql-paid',
  '1.0.0',
  now(),
  'sql-direct-trade'
);
select public.fulfill_order_payment(
  '20000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000c001',
  'community-sql-paid',
  '1.0.0',
  now(),
  'sql-direct-trade'
);
select public.begin_theme_order_refund(
  '20000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000c001',
  'SQL direct refund reversal test'
);
select public.complete_theme_order_refund(
  '20000000-0000-4000-8000-00000000c001',
  false
);

do $$
declare
  v_balance integer;
  v_count integer;
begin
  select balance into v_balance from public.point_accounts
  where user_id = '00000000-0000-4000-8000-00000000b001';
  if v_balance <> 68 then
    raise exception 'direct Alipay creator reward expected total 68, got %', v_balance;
  end if;
  select count(*) into v_count from public.point_ledger_entries
  where idempotency_key = 'alipay-creator-reward:20000000-0000-4000-8000-00000000c001';
  if v_count <> 1 then raise exception 'direct Alipay reward settled more than once'; end if;
  select count(*) into v_count from public.point_ledger_entries
  where idempotency_key in (
    'theme-order-refund-hold:20000000-0000-4000-8000-00000000c001:1',
    'theme-order-refund-reversal:20000000-0000-4000-8000-00000000c001:1'
  );
  if v_count <> 2 then raise exception 'direct refund hold/reversal entries missing'; end if;
end
$$;

insert into public.point_orders (
  id, user_id, pack_id, price_cents, base_points, bonus_points,
  status, out_trade_no
)
values (
  '10000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000b001',
  'starter-60', 600, 60, 0, 'pending', 'ctp-sql-author'
);
select public.fulfill_point_order_payment(
  '10000000-0000-4000-8000-00000000b001', now(), 'sql-trade-author'
);
select public.begin_point_order_refund(
  '10000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-00000000c001',
  'sql-refund-author',
  'SQL refund reversal test'
);
select public.complete_point_order_refund(
  '10000000-0000-4000-8000-00000000b001', false
);

select public.adjust_point_balance(
  '00000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000b001',
  5,
  'SQL audited adjustment',
  'sql-admin-adjustment'
);

do $$
declare
  v_balance integer;
  v_count integer;
begin
  select balance into v_balance from public.point_accounts
  where user_id = '00000000-0000-4000-8000-00000000b001';
  if v_balance <> 133 then
    raise exception 'refund reversal + adjustment expected 133, got %', v_balance;
  end if;
  select count(*) into v_count from public.point_ledger_entries
  where idempotency_key in (
    'point-order-refund-hold:10000000-0000-4000-8000-00000000b001:sql-refund-author',
    'point-order-refund-reversal:10000000-0000-4000-8000-00000000b001:sql-refund-author',
    'sql-admin-adjustment'
  );
  if v_count <> 3 then raise exception 'refund/adjustment audit entries missing'; end if;

  if has_function_privilege(
    'authenticated',
    'public.unlock_theme_with_points(uuid,text)',
    'execute'
  ) then raise exception 'authenticated can execute privileged unlock RPC'; end if;
  if has_table_privilege('authenticated', 'public.point_accounts', 'update') then
    raise exception 'authenticated can directly update point accounts';
  end if;
  if has_table_privilege('authenticated', 'public.point_ledger_entries', 'insert') then
    raise exception 'authenticated can directly insert ledger entries';
  end if;
end
$$;

rollback;
