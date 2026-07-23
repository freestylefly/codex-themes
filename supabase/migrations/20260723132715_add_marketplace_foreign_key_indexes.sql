-- Production migration 20260723132715.
-- Cover every marketplace foreign key that is queried or participates in
-- parent-row update/delete checks. PostgreSQL does not create these indexes
-- automatically.

create index if not exists idx_orders_creator_id
  on public.orders (creator_id)
  where creator_id is not null;

create index if not exists idx_point_ledger_admin_user
  on public.point_ledger_entries (admin_user_id)
  where admin_user_id is not null;

create index if not exists idx_point_ledger_counterparty_user
  on public.point_ledger_entries (counterparty_user_id)
  where counterparty_user_id is not null;

create index if not exists idx_point_orders_pack
  on public.point_orders (pack_id);

create index if not exists idx_theme_products_current_submission
  on public.theme_products (current_submission_id)
  where current_submission_id is not null;

create index if not exists idx_theme_submissions_reviewed_by
  on public.theme_submissions (reviewed_by)
  where reviewed_by is not null;
