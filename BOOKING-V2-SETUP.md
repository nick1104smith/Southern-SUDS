# Booking System v2 — Setup & Testing Guide

Status: **built locally, connected to your real Supabase project, not deployed.** Nothing has been committed or pushed to GitHub, and the live site is untouched.

## What this is

A full replacement for the old Google Forms/Apps Script booking flow — a Supabase-backed booking form, a redesigned admin dashboard (sidebar, calendar, customers, gallery, notifications, light/dark mode), and a photo system for both customers and you.

- `booking-new.html` / `booking-new.js` — customer-facing booking form (`http://localhost:5500/booking-new.html`)
- `admin.html` / `admin.js` — admin dashboard (`http://localhost:5500/admin.html`)
- `booking-shared.js` — pricing catalog, demo-mode fallback, and photo upload/compression helpers shared by both pages
- `booking-v2.css` — light/dark theme system + all dashboard layout (sidebar, cards, calendar, gallery, photo UI)
- `supabase-config.js` — your real project URL + anon key (already filled in)
- `supabase/schema.sql` — migration 1: bookings, admins, core RLS
- `supabase/schema-v2-photos-pricing-notifications.sql` — migration 2: photos, server-verified pricing, Realtime, Storage
- `supabase/schema-v3-email-notifications.sql` — migration 3: email trigger scaffold (inactive until you provide a Resend key)

**`index.html`, `script.js`, and `styles.css` were not touched.** The old booking form is still exactly as it was and still works on the live site.

## Your Supabase project is already live and connected

Project: `gorphrtoafpbelbdffqd` ("Southern Suds Booking 4"). Everything below has already been applied and tested against it — you don't need to run any SQL yourself unless you want to review it.

- `bookings` — every booking request, with server-verified pricing
- `service_pricing` — the pricing catalog the database uses to independently recompute every price (see "Security" below)
- `admins` — allowlist of who can access the dashboard (`nick1104smith@gmail.com` is in it)
- `booking_photos` — photo metadata, linked to bookings
- Storage bucket `booking-photos` — private, 8MB/file limit, JPG/PNG/WebP only
- Realtime enabled on `bookings` and `booking_photos`

## Try it right now

1. Make sure the local dev server is running (`http://localhost:5500`).
2. `http://localhost:5500/booking-new.html` — submit a real test booking, optionally attach a photo in step 3.
3. `http://localhost:5500/admin.html` — log in with `nick1104smith@gmail.com`. You should see the booking appear, with a red 🔴 marker until you open it (unread).

(If `supabase-config.js` still had placeholder values you'd be in demo mode using localStorage instead — it doesn't, so you're talking to the real database.)

## New: notifications

**In-dashboard (fully working right now):**
- A bell icon in the top bar shows an unread count — click it for a dropdown of unread requests, click one to open it.
- The sidebar's "Notifications" page lists everything unread, with a "Mark all as read" button.
- **Supabase Realtime** is wired up — while the dashboard is open, a new booking appears instantly with no refresh needed, the bell badge updates, and (if you've granted the browser permission, which it asks for after login) a native OS notification pops up. The browser tab title also flashes "🔴 New Booking!" until you switch back to it.
- This works whenever the admin.html tab is open (foreground or backgrounded, as long as the browser is running). It is **not** a true push notification that reaches your phone when the browser is fully closed — see below for that.

**Email — live and confirmed working:**
- Built entirely in Postgres — a trigger fires after every booking insert, reads a `resend_api_key` secret from Supabase Vault, and sends an email via [Resend](https://resend.com)'s API using `pg_net` (no Edge Function, no CLI deploy needed).
- Your Resend key is stored in Vault (never in any file in this repo). Tested twice with real inserts — confirmed a real email was accepted by Resend (`status_code: 200`, real email ID returned).
- **Recipient is currently `nick1104smith@gmail.com`**, not `southernsudsmd@gmail.com` — Resend's sandbox mode (no verified domain yet) only allows sending to the account's own signup address. Once you verify a domain at resend.com/domains, tell me and I'll switch both the recipient and the `from` address to your business address.
- The email includes customer name, service, vehicle, requested date/time, price, phone, and a link to the admin dashboard (currently pointed at `localhost:5500` — I'll update that link once this is live).
- Uses Resend's `onboarding@resend.dev` sending address until a domain is verified.

## New: server-verified pricing (security)

Per your instruction not to trust client-submitted prices: **the database now recomputes price independently on every insert**, ignoring whatever the customer's browser sent. The customer form sends a `service_key` (e.g. `full-detail`) and `vehicle_size` (e.g. `compact`); a Postgres trigger looks up the real price from the `service_pricing` table and overwrites both `price` and the `service` label before the row is saved. I tested this directly — a forged request sending `price: 1` for a $300 service was silently corrected to $300 server-side. The price shown in the customer-facing form is just a preview; it has no bearing on what's actually charged.

## New: photo system

- **Customers** can optionally attach photos in booking step 3 (notes step) — previewed before submitting, uploaded right after the booking is created, tagged `uploaded_by: customer`.
- **You** can upload photos inside any booking's detail view — pick a category (Before/After/Damage/Other), drag-and-drop or tap to upload, with live progress and per-file success/failure.
- Images over 1.5MB are automatically downscaled/compressed client-side (max 1920px, JPEG ~82% quality) before upload.
- The Storage bucket enforces an 8MB/file hard limit and only accepts JPG/PNG/WebP — server-side, not just client-side validation.
- **Nothing is public.** Customers can upload but never read back any photo (their own or anyone else's) — verified directly: an anonymous request for the file it just uploaded returns "not found." Only an authenticated admin account can view photos, via short-lived signed URLs generated on demand.
- A dedicated **Gallery** page in the sidebar shows every photo across all bookings, filterable by category — useful for before/after comparisons.
- Deleting a photo asks for confirmation first and removes both the file and its database row.

## New: dashboard redesign

- Sidebar navigation: Dashboard, Bookings, Calendar, Customers, Gallery, Notifications, Settings, Logout.
- Dashboard home: 6 summary cards (Today's Appointments, Pending Requests, Confirmed, Completed, Total Revenue, Upcoming), plus "Needs Your Attention" (pending), "Upcoming Appointments," and "Recent Bookings" lists.
- Bookings page: status filter tabs + a search box (top bar) matching name, phone, email, or booking ID.
- Calendar page: month grid with color-coded dots per status; click a day to see that day's bookings; click a booking to open it.
- Customers page: auto-grouped from bookings by email (no separate signup system exists, so this is derived rather than a distinct accounts table) — shows visit count and lifetime spend per customer.
- Every booking opens in a detail view with Confirm / Decline / Complete / Cancel / Edit buttons. Decline and Cancel ask for confirmation first (framed as customer-facing/negative actions); Confirm and Complete apply immediately since they're the common, low-risk path.
- Pending bookings get a colored left-border + 🔴 marker so they visually stand out everywhere they appear.

## New: light/dark mode

- Sun/moon toggle in the top bar. Defaults to dark (matches the brand), remembers your choice in `localStorage`, and applies before first paint via a small inline script — no flash of the wrong theme.
- Both themes keep the same red Southern Suds accent; only backgrounds/surfaces/text change.

## New: mobile

- Sidebar becomes an off-canvas menu below 900px width (hamburger icon + backdrop), so nothing gets squeezed.
- Cards, buttons, and the detail view all reflow to single-column with full-width tap targets — no horizontal scrolling.

## Security summary

- Anonymous visitors can only INSERT a booking (`status='pending'`, `service_key` required) and can only write (never read) photos — all enforced by Row Level Security and Storage policies, verified with live requests, not just assumed.
- Only accounts listed in `admins` can read/update bookings or photos — verified: an authenticated non-admin or anonymous session gets zero rows back, never an error revealing data exists.
- Price is computed server-side, not trusted from the client — verified with a live forged request.
- No service_role key or Resend key exists anywhere in frontend code, ever.
- Duplicate double-submits are blocked by the booking's own client-generated `id` acting as both primary key and idempotency guard.

## What still needs you

- [ ] Click through the full flow yourself (see testing checklist below) — I can verify the backend with `curl`/API calls, but only you can click through the actual rendered UI in a browser.
- [ ] Check `nick1104smith@gmail.com` for the two test notification emails sent during setup verification.
- [ ] (Optional, later) Verify a domain at resend.com/domains so email can go to `southernsudsmd@gmail.com` directly with a branded from-address instead of the shared Resend test sender.

## Testing checklist for you to run

- [ ] Submit a booking with a tiered service (e.g. Full Southern Detail) — confirm price updates per vehicle size
- [ ] Submit one with a photo attached — confirm it appears in that booking's detail view in admin.html
- [ ] Confirm the bell badge and a native notification appear without refreshing (keep admin.html open in one tab, submit a booking in another)
- [ ] Toggle light/dark mode, reload the page, confirm it remembers and doesn't flash
- [ ] Open a booking, click Confirm, Decline (should ask to confirm), Complete, Cancel (should ask to confirm) — check status badge updates everywhere
- [ ] Try the Calendar, Customers, and Gallery pages
- [ ] Try the search box and status filter tabs on the Bookings page
- [ ] Resize your browser (or use your phone) to confirm the mobile sidebar/layout works
- [ ] Upload a photo directly from the admin detail view, delete it (confirm the confirmation prompt appears)

## What steps will eventually be required to go live

None of this is done yet:

1. You test and approve everything above.
2. (Optional) Give me a Resend key to activate email.
3. Fold the new booking form into `index.html` (or link to it as its own page) and retire or keep the old Google Apps Script flow as a fallback — your call.
4. Update the email trigger's dashboard link from `localhost:5500` to the real domain.
5. Remove the `booking-v2` entries from `.gitignore`, commit, and push — only when you say so.
6. Redeploy via Hostinger's Git integration (already connected from your earlier session).

I will not do any of steps 3-6 until you explicitly tell me to.
