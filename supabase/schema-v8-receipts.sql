-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 8
-- Receipts: auto-emailed to the customer the moment a job is marked
-- Completed, plus a manually-callable resend for the admin dashboard.
-- ============================================================================
-- Reuses the exact same Vault secret already stored for owner notifications
-- (resend_api_key) — no new secret needed. Same sandbox limitation applies
-- until a domain is verified at resend.com/domains: Resend's free tier can
-- only deliver to the account's own signup address, not arbitrary
-- customers. This is built correctly either way; it just won't actually
-- land in a customer's inbox until that verification is done.
-- Safe to re-run.

alter table public.bookings add column if not exists receipt_sent_at timestamptz;

-- ----------------------------------------------------------------------------
-- Does the actual send. Not directly callable by anyone — only the trigger
-- (system-internal, trusted by definition) and the public wrapper below
-- (which checks admin auth first) ever call this.
-- ----------------------------------------------------------------------------
create or replace function public._send_receipt_email_internal(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  b record;
  api_key text;
  price_text text;
  tip_text text;
  total_text text;
  method_label text;
  html_body text;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Booking not found');
  end if;
  if b.email is null or b.email = '' then
    return jsonb_build_object('ok', false, 'error', 'No email on file for this customer');
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if api_key is null then
    return jsonb_build_object('ok', false, 'error', 'Email not configured (no resend_api_key in Vault)');
  end if;

  price_text := '$' || coalesce(b.final_price, b.price, 0)::text;
  tip_text := '$' || coalesce(b.tip_amount, 0)::text;
  total_text := '$' || coalesce(b.total_collected, coalesce(b.final_price, b.price, 0))::text;
  method_label := coalesce(initcap(b.payment_method), 'Not recorded');

  html_body :=
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1c1714;">' ||
      '<div style="background:#c81e1e;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">' ||
        '<h1 style="margin:0;font-size:20px;">Southern Suds Mobile Detailing</h1>' ||
        '<p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Receipt for your service</p>' ||
      '</div>' ||
      '<div style="border:1px solid #e6dcd2;border-top:none;padding:24px;border-radius:0 0 10px 10px;">' ||
        '<p>Hi ' || b.customer_name || ',</p>' ||
        '<p>Thank you for choosing Southern Suds. Here''s a receipt for your completed service:</p>' ||
        '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Service</td><td style="padding:6px 0;text-align:right;">' || b.service || '</td></tr>' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Vehicle</td><td style="padding:6px 0;text-align:right;">' || coalesce(b.vehicle_type,'—') || '</td></tr>' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Date</td><td style="padding:6px 0;text-align:right;">' || coalesce(b.payment_date::text, b.requested_date::text) || '</td></tr>' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Service Price</td><td style="padding:6px 0;text-align:right;">' || price_text || '</td></tr>' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Tip</td><td style="padding:6px 0;text-align:right;">' || tip_text || '</td></tr>' ||
          '<tr><td style="padding:10px 0 6px;font-weight:bold;border-top:1px solid #e6dcd2;">Total Collected</td><td style="padding:10px 0 6px;text-align:right;font-weight:bold;border-top:1px solid #e6dcd2;">' || total_text || '</td></tr>' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Payment Method</td><td style="padding:6px 0;text-align:right;">' || method_label || '</td></tr>' ||
        '</table>' ||
        '<p style="font-size:13px;color:#6f645b;">Questions about this receipt? Reply to this email or call/text (713) 269-1708.</p>' ||
        '<p style="font-size:13px;color:#6f645b;margin-top:20px;">— Southern Suds Mobile Detailing<br>Houston, TX</p>' ||
      '</div>' ||
    '</div>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'Southern Suds Mobile Detailing <onboarding@resend.dev>',
      'to', jsonb_build_array(b.email),
      'subject', 'Your Southern Suds Receipt — ' || b.service,
      'html', html_body
    )
  );

  update public.bookings set receipt_sent_at = now() where id = p_booking_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Public wrapper — the one the admin dashboard actually calls (manual send
-- or resend). Checks real admin auth first, unlike the internal function.
-- ----------------------------------------------------------------------------
create or replace function public.send_receipt_email(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;
  return public._send_receipt_email_internal(p_booking_id);
end;
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default
-- (so PostgREST can expose them as RPCs out of the box) — explicitly strip
-- that back down. Found and fixed during testing: a plain `revoke ... from
-- public` alone does not touch anon's own separate default grant; anon
-- could reach the function (though its internal is_admin() check still
-- correctly refused it) until revoked here directly.
revoke all on function public.send_receipt_email(uuid) from public, anon, authenticated;
grant execute on function public.send_receipt_email(uuid) to authenticated;
revoke all on function public._send_receipt_email_internal(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Auto-send the moment a job transitions INTO Completed. Does not re-fire
-- on later edits to an already-completed booking (e.g. a price correction)
-- — only the status transition itself triggers it.
-- ----------------------------------------------------------------------------
create or replace function public.notify_completion_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    perform public._send_receipt_email_internal(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_send_receipt on public.bookings;
create trigger bookings_send_receipt
  after update of status on public.bookings
  for each row execute function public.notify_completion_receipt();
