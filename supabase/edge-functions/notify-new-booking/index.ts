// ============================================================================
// notify-new-booking — Supabase Edge Function
// ============================================================================
// Sends an email to the shop owner whenever a new row is inserted into
// public.bookings. This runs entirely server-side, so this is the correct
// place to hold a private email-provider API key — it must never be added
// to any file that ships to the browser (supabase-config.js, booking-new.js,
// admin.js, etc).
//
// SETUP (do this once you're ready to turn notifications on — not required
// for local testing of the booking form/admin dashboard):
//
//   1. Install the Supabase CLI and log in (npm install -g supabase, then
//      `supabase login`). Requires Node.js.
//   2. From the "Southern Suds" project folder:
//        supabase link --project-ref <your-project-ref>
//        supabase functions deploy notify-new-booking
//   3. Create a free account at https://resend.com (or swap the fetch below
//      for your preferred provider — SendGrid, Postmark, etc. all work the
//      same way) and grab an API key.
//   4. Set secrets (these stay on Supabase's servers, never in your repo):
//        supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//        supabase secrets set NOTIFY_TO_EMAIL=southernsudsmd@gmail.com
//   5. In the Supabase Dashboard: Database → Webhooks → Create a new webhook
//        Table: bookings   Event: Insert   Type: Supabase Edge Function
//        Function: notify-new-booking
//
// Until step 5 is done, new bookings simply won't trigger an email — the
// booking form and admin dashboard both work fully without this.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    // Database Webhooks send { type: "INSERT", table, record, old_record }
    const booking = payload?.record;

    if (!booking) {
      return new Response(JSON.stringify({ ok: false, error: "No record in payload" }), { status: 400 });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const NOTIFY_TO_EMAIL = Deno.env.get("NOTIFY_TO_EMAIL") ?? "southernsudsmd@gmail.com";

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set (supabase secrets set RESEND_API_KEY=...) — skipping email send.");
      // Return 200 so the webhook isn't retried forever — this is a config
      // gap, not a transient failure.
      return new Response(JSON.stringify({ ok: false, error: "Email not configured" }), { status: 200 });
    }

    const priceText = booking.price != null
      ? `${booking.price_is_estimate ? "Starting at " : ""}$${booking.price}`
      : "Custom quote";

    const html = `
      <h2>New booking request</h2>
      <p><strong>${escapeHtml(booking.customer_name)}</strong> requested <strong>${escapeHtml(booking.service)}</strong></p>
      <ul>
        <li>Phone: ${escapeHtml(booking.phone)}</li>
        <li>Email: ${escapeHtml(booking.email)}</li>
        <li>Address: ${escapeHtml(booking.address)}</li>
        <li>Vehicle: ${escapeHtml(booking.vehicle_type)}</li>
        <li>Requested: ${escapeHtml(booking.requested_date)} — ${escapeHtml(booking.requested_time)}</li>
        <li>Price: ${priceText}</li>
        <li>Notes: ${escapeHtml(booking.notes || "—")}</li>
      </ul>
      <p>Status: ${escapeHtml(booking.status)}</p>
      <p style="color:#888;font-size:12px;">Manage this request in your admin dashboard.</p>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Resend requires the "from" address to be on a domain you've
        // verified with them — replace before going live.
        from: "Southern Suds Bookings <bookings@yourdomain.com>",
        to: [NOTIFY_TO_EMAIL],
        subject: `New booking request from ${booking.customer_name}`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend API error:", errText);
      return new Response(JSON.stringify({ ok: false, error: errText }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});

function escapeHtml(str: unknown): string {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
