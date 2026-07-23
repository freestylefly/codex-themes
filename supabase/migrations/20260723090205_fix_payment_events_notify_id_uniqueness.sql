-- Intermediate production migration retained so local history matches the
-- deployed database. The following migration replaces this partial index with
-- a regular unique index that PostgREST can infer for ON CONFLICT (notify_id).

drop index if exists public.idx_payment_events_notify_id;

create unique index idx_payment_events_notify_id
  on public.payment_events (notify_id)
  where notify_id is not null;
