-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 7
-- Meta Conversions API trigger (NOT YET APPLIED)
-- ============================================================================
-- Do not run this until supabase/edge-functions/send-meta-conversion has
-- actually been deployed (needs a real META_PIXEL_ID and
-- META_CAPI_ACCESS_TOKEN as Edge Function secrets first) — otherwise this
-- trigger just calls a function that doesn't exist yet and logs a harmless
-- but pointless error on every booking.
--
-- Reuses the exact same Vault secrets already stored for the push
-- notification trigger (push_gateway_anon_key, project_url) — those are
-- generic "how do I reach my own Edge Functions" values, nothing
-- push-specific about them, so no new Vault secrets are needed here.

create or replace function public.notify_meta_capi()
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
    return new;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-meta-conversion',
    headers := jsonb_build_object('Authorization', 'Bearer ' || anon_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('booking_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists bookings_notify_meta_capi on public.bookings;
create trigger bookings_notify_meta_capi
  after insert on public.bookings
  for each row execute function public.notify_meta_capi();
