# Real Mobile Push Notifications — Setup & Testing Guide

Status: **built, deployed to your real Supabase project, and backend-tested end-to-end.** Nothing pushed/committed to GitHub, live site untouched — see the bottom for exactly what's needed before that changes.

## 1. Which push service did you choose?

**Native browser Web Push (VAPID) — not Firebase Cloud Messaging, not OneSignal.**

Why: your iPhone is an explicit target device, and **iOS Safari only supports the standard Web Push API**, and only for a PWA installed to the Home Screen — Apple doesn't allow FCM's or OneSignal's proprietary push channels on Safari at all. Both of those services, when they "support" Safari, are themselves just wrapping the exact same standard API this implementation uses directly. So there's no capability you'd gain from a third-party vendor — only an extra account to create, an extra secret to protect, and your customers' booking data touching a third party unnecessarily. Native Web Push needed **zero external signup**; I generated the required keypair myself.

## 2. How does the notification system work?

```
Customer submits booking
  → Row inserted into public.bookings (price/service server-verified, as before)
  → AFTER INSERT trigger fires (bookings_notify_push)
  → Trigger calls the send-push-notification Edge Function (fire-and-forget, via pg_net)
  → Edge Function loads the booking + every admin's registered devices
  → For each device, encrypts and signs a push message (VAPID) and sends it
    to that browser vendor's push service (Apple/Google/Mozilla — whichever
    the device uses; this is automatic, not something either of us configures)
  → Your phone's OS wakes the service worker, even if the dashboard isn't open
  → Service worker shows the OS-level notification
  → You tap it → the dashboard opens directly to that booking
```

If saving the booking fails, the trigger never fires — no notification is possible for a booking that doesn't exist. This is enforced by Postgres itself (triggers only run for rows that actually commit), not just application logic.

**Failure isolation:** the trigger call is fire-and-forget (`pg_net`, async) — nothing about sending a push can slow down or fail the customer's booking submission. Individual send failures (e.g. a device that uninstalled the app) are caught per-device, logged, and don't affect other devices or the booking. Expired devices (HTTP 404/410 from the push service) are automatically removed from your device list.

**Duplicate prevention:** `bookings.push_notified_at` is set the moment the Edge Function starts processing a booking, before any sends happen — a retry can never double-notify for the same booking.

## 3. What Supabase resources were created?

- **Table** `push_subscriptions` — one row per device (`user_id`, `endpoint`, `p256dh`, `auth_key`, `device_label`, `user_agent`, `created_at`)
- **Column** `bookings.push_notified_at` — dedup marker
- **RLS policy** on `push_subscriptions`: `for all ... using (user_id = auth.uid() and is_admin())` — an admin can only ever see/manage their own devices; verified live that anonymous requests get zero rows and are rejected outright when trying to insert
- **Trigger** `bookings_notify_push` (AFTER INSERT on `bookings`)
- **Edge Function** `send-push-notification` — deployed and live at your project (`gorphrtoafpbelbdffqd`)
- **Edge Function secrets**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **Vault secrets**: `push_gateway_anon_key`, `project_url` (only what the SQL trigger needs to reach the Edge Function — same pattern as the email notification trigger)

All of this is already live on your Supabase project and tested with real inserts — this is not a scaffold waiting to be deployed, it's actually running.

## 4. Do you need to create any outside account (Firebase, OneSignal)?

**No.** That's the point of the architecture choice above — nothing to sign up for.

## 5. What API keys or credentials do you need to provide?

**None.** I generated the VAPID keypair myself (using .NET's built-in cryptography — no external tool or account), and stored the private half directly in Supabase's Edge Function secrets, where it's never visible in any file. The public half is safe to expose and already sits in `supabase-config.js`, same as your Supabase anon key.

## 6. How do you enable notifications on your phone?

1. Open the admin dashboard on your phone (install it first — see question 7, though it also works in a regular browser tab).
2. Go to **Settings → Push Notifications**.
3. Tap **Enable Booking Notifications**.
4. Your phone will ask for notification permission — allow it.
5. Status changes to **Enabled**, and your device is now registered.

## 7. How do you install the admin dashboard on your phone?

- **iPhone (Safari):** open `admin.html` → tap the Share icon → **Add to Home Screen**.
- **Android (Chrome):** open `admin.html` → tap the menu (⋮) → **Install app** (or **Add to Home Screen**).

Once installed, it opens full-screen with its own icon and name ("SS Admin"), like a real app — no browser address bar.

⚠️ **iPhone-specific requirement:** Apple requires the dashboard to be installed to the Home Screen (step above) before push notifications will work at all in Safari — this isn't a limitation of this build, it's an iOS platform rule for every website's push notifications, not just this one. Notifications won't work if you just keep it open in a regular Safari tab. Desktop/Android don't have this requirement.

## 8. How do you send yourself a test notification?

Settings → Push Notifications → **Send Test Notification** (only appears once notifications are Enabled). It sends to every device you've registered, with:

> **Southern Suds**
> Test Notification
> Your booking notifications are working correctly.

## 9. What still needs to happen before this can be used on the live website?

- [ ] **You test it for real** — I've verified every backend piece (trigger fires, dedup works, RLS blocks anonymous access, the function runs and handles failures gracefully) using simulated data via direct API calls, since I have no way to click through a real browser or receive an actual push on a device. I cannot verify what an actual notification looks and feels like on your phone — only you can do that.
- [ ] Register your first real device via Settings and send yourself a real test notification.
- [ ] Submit a real test booking and confirm you actually get buzzed.
- [ ] Tap the notification and confirm it opens the correct booking (and, if you're logged out, that it lands you on the booking after logging in).
- [ ] Try it on more than one device if you want to confirm the multi-device behavior.
- [ ] When satisfied, tell me and I'll fold these files into the same review/deploy step as everything else — nothing here is pushed, committed, or live yet.

## A note on the dashboard's existing bell/Realtime notifications

Nothing about the existing in-dashboard notification bell, unread badge, or Supabase Realtime live-update behavior was changed or replaced — it still works exactly as before, and now works *alongside* real push notifications, not instead of them. If the dashboard tab happens to be open on a device where you've also enabled push, you may occasionally see two indications of the same new booking (the in-tab alert and the OS push) — that's intentional redundancy, not a bug, though let me know if you'd rather I suppress one when the other fires.
