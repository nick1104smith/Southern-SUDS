-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 6
-- Admin portal: manual appointment creation, in-progress status, internal
-- notes, payment status, and trusting the admin's own price overrides.
-- ============================================================================
-- Safe to re-run.

-- ----------------------------------------------------------------------------
-- 1. NEW COLUMNS
-- ----------------------------------------------------------------------------
-- Internal notes — visible to staff only, never shown to or writable by a
-- customer (no anon policy touches this column; the existing admin-only
-- select/update policies already cover it since it's the same table).
alter table public.bookings add column if not exists admin_notes text;

-- Whether the customer has actually paid yet, independent of *how* (that's
-- payment_method, captured at completion). Lets a confirmed-but-unpaid job
-- be tracked before it's ever marked completed.
alter table public.bookings add column if not exists payment_status text not null default 'unpaid';
do $$
begin
  alter table public.bookings
    add constraint bookings_payment_status_check
    check (payment_status in ('unpaid','paid','partial'));
exception when duplicate_object then null;
end $$;

-- Optional — only meaningful for manually-created appointments (a phone/
-- text booking) where you want the vehicle on record precisely. Nullable;
-- the customer-facing form still only asks for vehicle_type/vehicle_size.
alter table public.bookings add column if not exists vehicle_year text;
alter table public.bookings add column if not exists vehicle_make text;
alter table public.bookings add column if not exists vehicle_model text;

-- ----------------------------------------------------------------------------
-- 2. NEW STATUS: in_progress
-- ----------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending','confirmed','in_progress','declined','completed','cancelled'));

-- ----------------------------------------------------------------------------
-- 3. ADMIN CAN CREATE APPOINTMENTS DIRECTLY (phone/text bookings)
-- ----------------------------------------------------------------------------
-- This is a second, separate INSERT policy — Postgres OR's multiple
-- permissive policies together, so anonymous customers keep using their own
-- restricted policy (status='pending' only, no payment fields, price
-- server-verified) while an authenticated admin gets a second, unrestricted
-- path for entering a job that came in by phone or text, already at
-- whatever status/price they choose.
drop policy if exists "admins can create bookings" on public.bookings;
create policy "admins can create bookings"
  on public.bookings for insert
  to authenticated
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. TRUST THE ADMIN'S OWN PRICE
-- ----------------------------------------------------------------------------
-- The price-verification trigger exists to stop a customer's browser from
-- dictating its own price — it was never meant to second-guess the business
-- owner using their own admin portal. An authenticated admin's insert/update
-- (manual appointment creation, or editing an existing price) now passes
-- through untouched; the customer-facing booking form's inserts (always
-- anon) are unaffected and still fully server-verified as before.
create or replace function public.compute_booking_price()
returns trigger
language plpgsql
as $$
declare
  svc record;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.service_key is null then
    return new;
  end if;

  select * into svc from public.service_pricing where service_key = new.service_key;
  if not found then
    raise exception 'Unknown service_key: %', new.service_key;
  end if;

  if svc.is_quote then
    new.price := null;
    new.price_is_estimate := false;
  elsif svc.tiered then
    if new.vehicle_size is null then
      raise exception 'vehicle_size is required for service %', new.service_key;
    end if;
    new.price := case new.vehicle_size
      when 'compact' then svc.compact_price
      when 'full-size' then svc.full_size_price
      when 'larger' then svc.larger_price
    end;
    if new.price is null then
      raise exception 'No price configured for % / %', new.service_key, new.vehicle_size;
    end if;
    new.price_is_estimate := svc.price_is_estimate;
  else
    new.price := svc.flat_price;
    new.price_is_estimate := svc.price_is_estimate;
  end if;

  new.service := svc.name || case when new.vehicle_size is not null then
    ' — ' || (case new.vehicle_size
      when 'compact' then 'Compact Car'
      when 'full-size' then 'Full-Size Car'
      when 'larger' then 'Larger Vehicle / Truck'
      else new.vehicle_size
    end)
    else '' end;

  return new;
end;
$$;

-- ============================================================================
-- After running: nothing else needed. All of this is covered by the existing
-- "admins can view/update bookings" policies (same table, no column-level
-- restrictions), already verified live in earlier migrations.
-- ============================================================================
