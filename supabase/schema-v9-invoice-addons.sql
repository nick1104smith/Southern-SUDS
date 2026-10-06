-- ============================================================================
-- Southern Suds Mobile Detailing — Booking System v2, Migration 9
-- Makes the auto-emailed receipt match the on-screen admin receipt: a more
-- professional invoice layout (invoice number, payment-status stamp) plus
-- itemized add-on line items pulled from bookings.addons.
--
-- The add-on name -> price lookup below is a hardcoded mirror of
-- ADDON_CATALOG in booking-shared.js (and the add-on chips on index.html).
-- If you change a price in either of those places, update this CASE too.
-- Safe to re-run.
-- ============================================================================

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
  invoice_no text;
  paid_stamp text;
  addon_rows text := '';
  addon_name text;
  addon_amt numeric;
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

  price_text := '$' || to_char(coalesce(b.final_price, b.price, 0), 'FM999999990.00');
  tip_text := '$' || to_char(coalesce(b.tip_amount, 0), 'FM999999990.00');
  total_text := '$' || to_char(coalesce(b.total_collected, coalesce(b.final_price, b.price, 0)), 'FM999999990.00');
  method_label := coalesce(initcap(b.payment_method), 'Not recorded');
  invoice_no := 'INV-' || upper(left(b.id::text, 8));
  paid_stamp := case when b.payment_status = 'paid'
    then '<span style="border:2px solid #2a9d4a;color:#2a9d4a;font-weight:800;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:6px;">Paid</span>'
    else '<span style="border:2px solid #a3968a;color:#a3968a;font-weight:800;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:6px;">' ||
      coalesce(initcap(replace(b.payment_status, '_', ' ')), 'Unpaid') || '</span>'
  end;

  -- Itemize add-ons informationally (current catalog price) — same approach
  -- as the admin dashboard's printable receipt: never re-summed against
  -- final_price, which stays the single source of truth an admin may have
  -- manually adjusted.
  if b.addons is not null then
    foreach addon_name in array b.addons loop
      addon_amt := case addon_name
        when 'Pet Hair Removal' then 89.99
        when 'Engine Bay Cleaning' then 150
        when 'Stain Removal' then 129.99
        when 'Odor Treatment — Level 1' then 149.99
        when 'Odor Treatment — Level 2' then 249.99
        when 'Leather Conditioning' then 79.99
        when 'Interior Shampoo' then 69.99
        when 'Carpet Extraction' then 129.99
        when 'Ceramic Spray Sealant' then 149.99
        when 'Headlight Restoration' then 200
        when 'Mold Inspection' then 0
        else null
      end;
      addon_rows := addon_rows ||
        '<tr><td style="padding:4px 0;padding-left:16px;color:#6f645b;font-size:13px;">+ ' || addon_name || '</td>' ||
        '<td style="padding:4px 0;text-align:right;color:#6f645b;font-size:13px;">' ||
        (case when addon_amt is not null then '$' || to_char(addon_amt, 'FM999999990.00') else '—' end) ||
        '</td></tr>';
    end loop;
  end if;

  html_body :=
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1c1714;">' ||
      '<div style="background:#c81e1e;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">' ||
        '<h1 style="margin:0;font-size:20px;">Southern Suds Mobile Detailing</h1>' ||
        '<p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Invoice / Receipt ' || invoice_no || '</p>' ||
      '</div>' ||
      '<div style="border:1px solid #e6dcd2;border-top:none;padding:24px;border-radius:0 0 10px 10px;">' ||
        '<div style="text-align:right;margin-bottom:12px;">' || paid_stamp || '</div>' ||
        '<p>Hi ' || b.customer_name || ',</p>' ||
        '<p>Thank you for choosing Southern Suds. Here''s your receipt for this service:</p>' ||
        '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Service</td><td style="padding:6px 0;text-align:right;">' || b.service || '</td></tr>' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Vehicle</td><td style="padding:6px 0;text-align:right;">' || coalesce(b.vehicle_type,'—') || '</td></tr>' ||
          '<tr><td style="padding:6px 0;color:#6f645b;">Date</td><td style="padding:6px 0;text-align:right;">' || coalesce(b.payment_date::text, b.requested_date::text) || '</td></tr>' ||
          '<tr><td style="padding:6px 0 2px;font-weight:600;">Service Price</td><td style="padding:6px 0 2px;text-align:right;font-weight:600;">' || price_text || '</td></tr>' ||
          addon_rows ||
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

-- `create or replace function` resets EXECUTE grants to Supabase's default
-- (anon/authenticated get it automatically for PostgREST RPC exposure) —
-- strip that back down exactly like schema-v8 did. This function is never
-- meant to be callable directly by anyone except the trigger and the
-- admin-gated public.send_receipt_email() wrapper (unchanged by this file).
revoke all on function public._send_receipt_email_internal(uuid) from public, anon, authenticated;
