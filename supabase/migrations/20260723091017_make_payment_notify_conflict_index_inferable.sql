-- PostgREST/Supabase upsert emits ON CONFLICT (notify_id) without a predicate.
-- A partial unique index cannot be inferred by that conflict target. PostgreSQL
-- unique indexes already allow multiple NULL values, so use a regular unique
-- index to keep notifications idempotent while accepting legacy NULL rows.

drop index if exists public.idx_payment_events_notify_id;

create unique index idx_payment_events_notify_id
  on public.payment_events (notify_id);
