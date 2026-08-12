-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 3
-- Email notification on new booking (via pg_net + Vault — no Edge Function
-- or CLI deploy needed; everything here runs as plain Postgres).
-- ============================================================================
-- Safe to run with no Resend key configured yet — the trigger silently
-- no-ops until a 'resend_api_key' secret exists in Vault, so it never
-- blocks or breaks a booking submission either way.

create extension if not exists pg_net;

create or replace function public.notify_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net, extensions
as $$
declare
  api_key   text;
  -- Resend's sandbox mode (no verified domain yet) only allows sending to
  -- the account's own signup address. Once a domain is verified at
  -- resend.com/domains, this can be changed back to the business inbox
  -- (southernsudsmd@gmail.com) or any address.
  to_email  text := 'nick1104smith@gmail.com';
  price_text text;
  html_body text;
begin
  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key' limit 1;

  if api_key is null then
    return new; -- Not configured yet — booking still saves normally.
  end if;

  price_text := case
    when new.price is null then 'Custom Quote'
    when new.price_is_estimate then 'Starting at $' || new.price
    else '$' || new.price
  end;

  html_body :=
    '<h2>New booking request</h2>' ||
    '<p><strong>' || new.customer_name || '</strong> requested <strong>' || new.service || '</strong></p>' ||
    '<ul>' ||
      '<li>Phone: ' || new.phone || '</li>' ||
      '<li>Vehicle: ' || new.vehicle_type || '</li>' ||
      '<li>Requested: ' || new.requested_date || ' — ' || new.requested_time || '</li>' ||
      '<li>Price: ' || price_text || '</li>' ||
    '</ul>' ||
    '<p><a href="https://southernsudsmobiledetailing.com/admin.html">Open Admin Dashboard</a></p>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      -- onboarding@resend.dev works out of the box on a free Resend
      -- account with no domain verification — swap for a verified
      -- southernsudsmobiledetailing.com address later if desired.
      'from', 'Southern Suds Bookings <onboarding@resend.dev>',
      'to', jsonb_build_array(to_email),
      'subject', 'New booking request from ' || new.customer_name,
      'html', html_body
    )
  );

  return new;
end;
$$;

drop trigger if exists bookings_notify_new_booking on public.bookings;
create trigger bookings_notify_new_booking
  after insert on public.bookings
  for each row execute function public.notify_new_booking();

-- ============================================================================
-- To activate: get a free API key from https://resend.com, then run
-- (from the SQL Editor, or ask me to run it for you once you paste the key):
--
--   select vault.create_secret('re_your_key_here', 'resend_api_key');
--
-- That's it — no redeploy needed, the trigger checks Vault on every insert.
-- ============================================================================
