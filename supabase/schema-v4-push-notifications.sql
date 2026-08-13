-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 4
-- Web Push notifications (native browser Push API, VAPID — no third-party
-- push provider account required).
-- ============================================================================
-- Safe to re-run.

-- ----------------------------------------------------------------------------
-- 1. PUSH SUBSCRIPTIONS
-- ----------------------------------------------------------------------------
-- One row per device an admin has enabled notifications on. A "subscription"
-- here is exactly what the browser's PushManager.subscribe() returns —
-- endpoint + two keys needed to encrypt messages to that specific device.
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth_key      text not null,
  device_label  text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Only an authenticated admin can register/view/remove THEIR OWN devices.
-- No policy exists for anon at all, so random visitors can't touch this
-- table in any way — not even to insert a row for themselves.
drop policy if exists "admins manage their own push subscriptions" on public.push_subscriptions;
create policy "admins manage their own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. DEDUP TRACKING ON BOOKINGS
-- ----------------------------------------------------------------------------
-- A trigger only ever fires once per INSERT, so duplicate sends aren't a risk
-- from normal operation — this column exists so the send-push-notification
-- Edge Function can check "have I already handled this booking?" before
-- doing anything, in case it's ever invoked more than once for the same row
-- (e.g. a manual retry), and so you can see in the data whether a push was
-- attempted for a given booking.
alter table public.bookings add column if not exists push_notified_at timestamptz;

-- ----------------------------------------------------------------------------
-- 3. TRIGGER — call the send-push-notification Edge Function on new bookings
-- ----------------------------------------------------------------------------
-- Mirrors the email trigger's shape (pg_net, fire-and-forget, never blocks
-- or fails the booking insert). Unlike email, the actual push encryption/
-- signing (VAPID JWT + payload encryption) has to happen in real code, not
-- SQL — pgcrypto doesn't support the EC/HKDF/AES-GCM operations Web Push
-- requires — hence calling an Edge Function instead of an external API
-- directly. The Edge Function uses its own auto-provided service_role key
-- to do the actual work; the anon key here is only what the Edge Functions
-- gateway needs to accept the request, not a meaningful authorization.
create or replace function public.notify_push_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  anon_key text;
  project_url text;
begin
  select decrypted_secret into anon_key from vault.decrypted_secrets where name = 'push_gateway_anon_key' limit 1;
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url' limit 1;

  if anon_key is null or project_url is null then
    return new; -- Not configured yet — booking still saves normally.
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || anon_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('booking_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists bookings_notify_push on public.bookings;
create trigger bookings_notify_push
  after insert on public.bookings
  for each row execute function public.notify_push_new_booking();

-- ============================================================================
-- After running this file:
--   1. Deploy the send-push-notification Edge Function (supabase/edge-functions/).
--   2. Set its secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
--   3. Store two Vault secrets so the trigger above can reach it:
--        select vault.create_secret('<anon key>', 'push_gateway_anon_key');
--        select vault.create_secret('https://<ref>.supabase.co', 'project_url');
-- ============================================================================
