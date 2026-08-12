-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2
-- ============================================================================
-- Run this entire file in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run — uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF
-- EXISTS everywhere it can.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. BOOKINGS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Customer
  customer_name     text not null,
  phone             text not null,
  email             text not null,
  address           text not null,

  -- Service
  service           text not null,
  vehicle_type      text not null,
  addons            text[] not null default '{}',
  price             numeric(10,2),
  price_is_estimate boolean not null default false,

  -- Schedule
  requested_date    date not null,
  requested_time    text not null,
  notes             text,

  -- Status
  status            text not null default 'pending'
                     check (status in ('pending','confirmed','declined','completed','cancelled')),

  -- One key per form session, generated client-side. The unique constraint
  -- turns an accidental double-click or a network-retry resubmit into a
  -- harmless no-op (23505 unique_violation) instead of a duplicate row —
  -- see booking-new.js.
  idempotency_key   uuid not null unique
);

create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. ADMIN ALLOWLIST
-- ----------------------------------------------------------------------------
-- Add a row here (user_id = the Supabase Auth user's id) for every person
-- who should be able to see and manage bookings. See BOOKING-V2-SETUP.md
-- for how to create that login and add them here — nobody can add
-- themselves; it has to be done from the SQL Editor or Table Editor.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.bookings enable row level security;
alter table public.admins   enable row level security;

-- Anyone — including anonymous website visitors using the public anon key —
-- may submit a new booking request, but ONLY as status 'pending'. They can
-- never read, update, or delete any row (no select/update/delete policy
-- exists for anon, and RLS defaults to deny).
drop policy if exists "public can submit booking requests" on public.bookings;
create policy "public can submit booking requests"
  on public.bookings for insert
  to anon, authenticated
  with check (status = 'pending');

-- Only authenticated users listed in public.admins can read bookings.
drop policy if exists "admins can view bookings" on public.bookings;
create policy "admins can view bookings"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

-- Only admins can update a booking (e.g. change its status).
drop policy if exists "admins can update bookings" on public.bookings;
create policy "admins can update bookings"
  on public.bookings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No delete policy on purpose. Use the "Cancelled" status instead of
-- deleting so a booking is never silently lost. Add a delete policy later
-- if you decide you actually want that.

-- The admins table itself is only readable by admins (nobody can read it
-- to see who else has access, and nobody can INSERT/UPDATE it via the API
-- at all — that only happens from the SQL Editor / Table Editor).
drop policy if exists "admins can view admin list" on public.admins;
create policy "admins can view admin list"
  on public.admins for select
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- After running this file:
--   1. Authentication → Users → Add user → create your admin login.
--   2. Copy that user's UID, then run:
--        insert into public.admins (user_id) values ('paste-uid-here');
--   3. See BOOKING-V2-SETUP.md for the rest (env vars, notifications).
-- ============================================================================
