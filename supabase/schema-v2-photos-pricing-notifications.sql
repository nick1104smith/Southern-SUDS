-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 2
-- Photos, server-verified pricing, unread tracking, Realtime, Storage
-- ============================================================================
-- Run AFTER supabase/schema.sql. Safe to re-run — uses IF NOT EXISTS / DROP
-- POLICY IF EXISTS / ON CONFLICT / exception-guarded DO blocks throughout.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. SERVER-VERIFIED PRICING
-- ----------------------------------------------------------------------------
-- Mirrors the SERVICES catalog in booking-shared.js. The customer's browser
-- is never trusted for price — a BEFORE trigger below recomputes price and
-- price_is_estimate from service_key + vehicle_size every time a booking is
-- inserted, using this table as the single source of truth. Whatever price
-- the client sent in its request is discarded.
create table if not exists public.service_pricing (
  service_key      text primary key,
  name             text not null,
  tiered           boolean not null default false,
  is_quote         boolean not null default false,
  price_is_estimate boolean not null default false,
  flat_price       numeric(10,2),
  compact_price    numeric(10,2),
  full_size_price  numeric(10,2),
  larger_price     numeric(10,2)
);

insert into public.service_pricing (service_key, name, tiered, is_quote, price_is_estimate, flat_price, compact_price, full_size_price, larger_price) values
  ('southern-wash',    'Southern Wash', false, false, true,  99,   null, null, null),
  ('standard-refresh', 'Southern Standard Refresh', true, false, false, null, 185, 200, 215),
  ('full-detail',      'Full Southern Detail', true, false, false, null, 280, 300, 320),
  ('full-restoration', 'Full Restoration Detail', true, false, false, null, 485, 500, 520),
  ('interior-1',       'Interior Detailing — Level 1 (Base Interior Maintenance)', true, false, false, null, 120, 135, 150),
  ('interior-2',       'Interior Detailing — Level 2 (Moderate Interior Detail)', true, false, false, null, 175, 200, 225),
  ('interior-3',       'Interior Detailing — Level 3 (Extreme Interior Detail)', true, false, true, null, 289, 315, 345),
  ('ceramic',          'Ceramic Protection', false, false, false, 599, null, null, null),
  ('pet-hair',         'Pet-Hair Removal', false, false, true, 89, null, null, null),
  ('stain-removal',    'Stain & Spill Treatment', false, false, false, 129, null, null, null),
  ('odor-1',           'Odor Treatment — Level 1 (Light Odor)', false, false, false, 149.99, null, null, null),
  ('odor-2',           'Odor Treatment — Level 2 (Strong / Lingering Odor)', false, false, false, 249.99, null, null, null),
  ('engine-bay',       'Engine Bay Cleaning', false, false, false, 150, null, null, null),
  ('headlight',        'Headlight Restoration', false, false, false, 200, null, null, null),
  ('mold-1',           'Mold Remediation — Level 1', false, false, false, 399, null, null, null),
  ('mold-2',           'Mold Remediation — Level 2', false, false, false, 599, null, null, null),
  ('mold-3',           'Mold Remediation — Level 3', false, false, false, 899, null, null, null),
  ('mold-4',           'Mold Remediation — Level 4', false, false, false, 1240, null, null, null),
  ('fleet',            'Fleet & Commercial Detailing', false, true, false, null, null, null, null),
  ('not-sure',         'Not Sure / Need Help Choosing', false, true, false, null, null, null, null)
on conflict (service_key) do update set
  name = excluded.name, tiered = excluded.tiered, is_quote = excluded.is_quote,
  price_is_estimate = excluded.price_is_estimate, flat_price = excluded.flat_price,
  compact_price = excluded.compact_price, full_size_price = excluded.full_size_price,
  larger_price = excluded.larger_price;

-- Added for full parity with the old booking form's dropdown (which had a
-- few quote-only options with no fixed price of their own).
insert into public.service_pricing (service_key, name, tiered, is_quote, price_is_estimate, flat_price, compact_price, full_size_price, larger_price) values
  ('mold-free',       'Mold Removal — Free Inspection', false, true, false, null, null, null, null),
  ('monthly-refresh', 'Monthly Refresh Plan', false, true, false, null, null, null, null),
  ('biweekly-care',   'Biweekly Care Plan', false, true, false, null, null, null, null),
  ('custom-fleet',    'Custom Fleet Plan', false, true, false, null, null, null, null)
on conflict (service_key) do update set name = excluded.name, is_quote = excluded.is_quote;

alter table public.service_pricing enable row level security;
drop policy if exists "anyone can read service pricing" on public.service_pricing;
create policy "anyone can read service pricing"
  on public.service_pricing for select
  to anon, authenticated
  using (true);
-- No insert/update/delete policy for anyone — this table is only ever
-- changed by re-running this migration from the SQL Editor / Management API.

-- ----------------------------------------------------------------------------
-- 2. BOOKINGS TABLE ADDITIONS
-- ----------------------------------------------------------------------------
alter table public.bookings add column if not exists service_key text;
alter table public.bookings add column if not exists vehicle_size text;
alter table public.bookings add column if not exists admin_viewed_at timestamptz;

do $$
begin
  alter table public.bookings
    add constraint bookings_service_key_fkey
    foreign key (service_key) references public.service_pricing (service_key);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.bookings
    add constraint bookings_vehicle_size_check
    check (vehicle_size is null or vehicle_size in ('compact','full-size','larger'));
exception when duplicate_object then null;
end $$;

create index if not exists bookings_admin_viewed_at_idx on public.bookings (admin_viewed_at);
create index if not exists bookings_requested_date_idx on public.bookings (requested_date);

create or replace function public.compute_booking_price()
returns trigger
language plpgsql
as $$
declare
  svc record;
begin
  if new.service_key is null then
    -- Legacy or admin-entered bookings without a recognized service_key
    -- keep whatever price was supplied directly (e.g. a manually quoted
    -- Fleet job) — the guard below only applies to the customer-facing
    -- booking form, which always sets service_key.
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

  -- Rebuild the human-readable label server-side too, so it can never say
  -- something different than what was actually priced.
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

drop trigger if exists bookings_compute_price on public.bookings;
create trigger bookings_compute_price
  before insert or update of service_key, vehicle_size on public.bookings
  for each row execute function public.compute_booking_price();

-- The public INSERT policy now also requires service_key, so every new
-- booking through the customer form is guaranteed to get a server-verified
-- price. (Re-created rather than altered — Postgres policies aren't
-- ALTERable in place.)
drop policy if exists "public can submit booking requests" on public.bookings;
create policy "public can submit booking requests"
  on public.bookings for insert
  to anon, authenticated
  with check (status = 'pending' and service_key is not null);

-- ----------------------------------------------------------------------------
-- 3. BOOKING PHOTOS
-- ----------------------------------------------------------------------------
create table if not exists public.booking_photos (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  storage_path text not null unique,
  category     text not null default 'other' check (category in ('before','after','damage','other')),
  uploaded_by  text not null check (uploaded_by in ('customer','admin')),
  caption      text,
  created_at   timestamptz not null default now()
);
create index if not exists booking_photos_booking_id_idx on public.booking_photos (booking_id);

alter table public.booking_photos enable row level security;

-- Customers may attach photos to the booking they're currently submitting
-- (uploaded_by = 'customer' only — they can never tag something as an
-- admin-added before/after photo). Admins can insert freely. Nobody can
-- read, update, or delete rows here except admins — matching the bookings
-- table's own security model, and relying on the same practical protection:
-- booking_id values are random UUIDs, not enumerable.
drop policy if exists "insert booking photos" on public.booking_photos;
create policy "insert booking photos"
  on public.booking_photos for insert
  to anon, authenticated
  with check (uploaded_by = 'customer' or public.is_admin());

drop policy if exists "admins can view booking photos" on public.booking_photos;
create policy "admins can view booking photos"
  on public.booking_photos for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins can update booking photos" on public.booking_photos;
create policy "admins can update booking photos"
  on public.booking_photos for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can delete booking photos" on public.booking_photos;
create policy "admins can delete booking photos"
  on public.booking_photos for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. STORAGE — private "booking-photos" bucket
-- ----------------------------------------------------------------------------
-- Not public. 8MB per file, images only — enforced by Supabase Storage
-- itself, not just client-side validation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-photos', 'booking-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload booking photos" on storage.objects;
create policy "upload booking photos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'booking-photos');

drop policy if exists "admins view booking photo files" on storage.objects;
create policy "admins view booking photo files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'booking-photos' and public.is_admin());

drop policy if exists "admins delete booking photo files" on storage.objects;
create policy "admins delete booking photo files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'booking-photos' and public.is_admin());

-- No anon/public SELECT policy exists on purpose — customers can upload
-- (write-only) but can never list, download, or view any photo, including
-- their own, once uploaded. Only an authenticated admin can read/download
-- (via signed URLs generated in admin.js).

-- ----------------------------------------------------------------------------
-- 5. REALTIME — so the dashboard can update without a refresh
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.booking_photos;
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- After running this file, see BOOKING-V2-SETUP.md for the (optional) email
-- notification setup, which uses a separate migration
-- (schema-v3-email-notifications.sql) since it needs your Resend API key.
-- ============================================================================
