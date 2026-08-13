-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 5
-- Revenue tracking: payment capture fields on bookings (no new table — a
-- completed booking has exactly one payment record, a 1:1 relationship a
-- separate table would only complicate).
-- ============================================================================
-- Safe to re-run.

alter table public.bookings add column if not exists final_price numeric(10,2);
alter table public.bookings add column if not exists tip_amount numeric(10,2) not null default 0;
alter table public.bookings add column if not exists payment_method text;
alter table public.bookings add column if not exists payment_date date;

do $$
begin
  alter table public.bookings
    add constraint bookings_payment_method_check
    check (payment_method is null or payment_method in ('cash','card','zelle','venmo','cashapp','other'));
exception when duplicate_object then null;
end $$;

-- Always final_price + tip_amount — never drifts, nothing to keep in sync by hand.
alter table public.bookings add column if not exists total_collected numeric(10,2)
  generated always as (coalesce(final_price, 0) + coalesce(tip_amount, 0)) stored;

create index if not exists bookings_payment_date_idx on public.bookings (payment_date);

-- Defense in depth: a customer's own booking request can never carry payment
-- data — the public INSERT policy already only allows status = 'pending',
-- and payment fields are only ever set by an authenticated admin's later
-- UPDATE (see the "Mark Completed" flow), covered by the existing
-- "admins can update bookings" policy already on this table. No new RLS
-- needed for these columns. This just makes the guarantee explicit and
-- re-checked by Postgres itself on every insert, not just app logic.
drop policy if exists "public can submit booking requests" on public.bookings;
create policy "public can submit booking requests"
  on public.bookings for insert
  to anon, authenticated
  with check (
    status = 'pending' and service_key is not null
    and tip_amount = 0 and final_price is null and payment_method is null
  );

-- ============================================================================
-- Revenue is computed live from this table (status = 'completed', filtered by
-- payment_date/requested_date) — never cached or duplicated elsewhere, so a
-- status change (e.g. completed -> cancelled) is instantly correct everywhere
-- with no extra bookkeeping.
-- ============================================================================
