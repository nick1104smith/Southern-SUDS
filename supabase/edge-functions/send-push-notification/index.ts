// ============================================================================
// send-push-notification — Supabase Edge Function
// ============================================================================
// Sends a real Web Push notification (native browser Push API, VAPID — no
// Firebase/OneSignal account involved) to registered admin devices.
//
// Two call paths:
//   1. Booking path — invoked by the bookings_notify_push database trigger
//      with { booking_id }. Looks up the booking + every admin's registered
//      devices (service_role, bypasses RLS deliberately — this is a
//      server-to-server call, not a user request) and sends to all of them.
//   2. Test path — invoked directly from the browser by a logged-in admin
//      via supabase.functions.invoke('send-push-notification', { body: { test: true } }).
//      Uses the CALLER's own JWT (forwarded automatically by supabase-js)
//      so Row Level Security naturally restricts this to that admin's own
//      devices — no manual permission check needed here, RLS does it.
//
// SETUP:
//   1. Install the Supabase CLI (requires Node.js), `supabase login`.
//   2. supabase link --project-ref <ref>
//   3. supabase functions deploy send-push-notification
//   4. supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:southernsudsmd@gmail.com
//      (VAPID_PUBLIC_KEY also goes in supabase-config.js — it's meant to be
//      public. VAPID_PRIVATE_KEY must only ever exist here.)
//   5. Store the two secrets the trigger needs to reach this function:
//        select vault.create_secret('<anon key>', 'push_gateway_anon_key');
//        select vault.create_secret('https://<ref>.supabase.co', 'project_url');
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// automatically available to every Edge Function — no need to set those
// three manually.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Deno resolves npm packages natively — no local Node/npm install needed to
// deploy this, only to run the Supabase CLI's deploy command itself.
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:southernsudsmd@gmail.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushSubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

function formatDateNice(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatBookingBody(b: Record<string, any>): string {
  const priceText = b.price != null
    ? (b.price_is_estimate ? `Starting at $${b.price}` : `$${b.price}`)
    : "Custom quote";
  const dateText = b.requested_date ? formatDateNice(b.requested_date) : "";
  // "Morning (8am–11am)" -> "Morning" — keeps the lock-screen line short.
  const timeText = (b.requested_time || "").split(" (")[0];
  return `${b.customer_name} • ${b.service}\n${b.vehicle_type} • ${dateText} ${timeText} • ${priceText}`;
}

async function sendToSubscriptions(
  subs: PushSubRow[],
  payload: Record<string, unknown>,
  svc: ReturnType<typeof createClient>
) {
  return Promise.allSettled(
    subs.map(async (sub) => {
      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } };
      try {
        await webpush.sendNotification(pushSub, JSON.stringify(payload));
      } catch (err: any) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone (browser unsubscribed, permission revoked,
          // app uninstalled) — clean it up so the device list stays accurate.
          await svc.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("Push send failed for subscription", sub.id, err?.message || err);
        }
        throw err;
      }
    })
  );
}

// The "Send Test Notification" button and (eventually) device registration
// call this function directly from the browser via supabase-js, unlike the
// database trigger's server-to-server pg_net call — a browser call is
// subject to CORS, so every response (including the preflight) needs these
// headers or the browser rejects it before our code ever runs, surfacing as
// a generic "Failed to send a request to the Edge Function" with no other
// detail. This was missing initially — the trigger path worked fine (no
// CORS involved) which is why testing via curl/pg_net didn't catch it.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error("VAPID keys not configured — set them with `supabase secrets set`.");
      return jsonResponse({ ok: false, error: "VAPID keys not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ---- Test notification path ------------------------------------------
    if (body.test) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const scoped = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: subs, error } = await scoped.from("push_subscriptions").select("*");
      if (error) {
        return jsonResponse({ ok: false, error: error.message });
      }
      if (!subs || subs.length === 0) {
        return jsonResponse({ ok: false, error: "No registered devices for this account." });
      }
      await sendToSubscriptions(subs as PushSubRow[], {
        title: "Southern Suds",
        body: "Test Notification\nYour booking notifications are working correctly.",
        url: "/admin.html"
      }, svc);
      return jsonResponse({ ok: true, sent: subs.length });
    }

    // ---- Real booking notification path -----------------------------------
    const bookingId = body.booking_id;
    if (!bookingId) {
      return jsonResponse({ ok: false, error: "Missing booking_id" }, 400);
    }

    const { data: booking, error: bookingErr } = await svc.from("bookings").select("*").eq("id", bookingId).single();
    if (bookingErr || !booking) {
      return jsonResponse({ ok: false, error: "Booking not found" });
    }
    if (booking.push_notified_at) {
      return jsonResponse({ ok: true, skipped: "already notified" });
    }

    const { data: subs, error: subsErr } = await svc.from("push_subscriptions").select("*");
    if (subsErr) {
      console.error("Could not load push subscriptions", subsErr.message);
      return jsonResponse({ ok: false, error: subsErr.message });
    }

    // Marked as handled BEFORE sending, so a slow or erroring send can't
    // cause a later retry to double-notify for the same booking.
    await svc.from("bookings").update({ push_notified_at: new Date().toISOString() }).eq("id", bookingId);

    if (subs && subs.length > 0) {
      await sendToSubscriptions(subs as PushSubRow[], {
        title: "Southern Suds",
        body: `New Booking Request\n${formatBookingBody(booking)}`,
        url: `/admin.html?booking=${booking.id}`
      }, svc);
    }

    return jsonResponse({ ok: true, sent: subs?.length ?? 0 });
  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
