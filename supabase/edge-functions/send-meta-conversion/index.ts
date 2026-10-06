// ============================================================================
// send-meta-conversion — Supabase Edge Function (NOT YET DEPLOYED)
// ============================================================================
// Server-side mirror of the browser's "Lead" pixel event, sent via Meta's
// Conversions API. This is the reliable half of the pair — it fires
// regardless of ad blockers, iOS tracking restrictions, or a customer
// closing the tab before the browser pixel finishes loading. Paired with
// the same event_id the browser sent (see meta-pixel.js's `eventID`
// option), Meta deduplicates the two into one lead, not two.
//
// Triggered the same way as the push-notification and email triggers
// already in this project: an AFTER INSERT trigger on bookings calls this
// function via pg_net, fire-and-forget, never blocking the booking itself.
//
// SETUP (once you have both values below):
//   1. Get your Pixel ID: Events Manager → Data Sources → your pixel →
//      Settings (top of page).
//   2. Get a Conversions API access token: same Settings page → Conversions
//      API section → "Generate access token" (or use a System User token
//      from Business Settings for something longer-lived / production-grade).
//   3. Deploy: supabase functions deploy send-meta-conversion --use-api
//   4. Set secrets:
//        supabase secrets set META_PIXEL_ID=... META_CAPI_ACCESS_TOKEN=...
//   5. Add a trigger calling this function, reusing the SAME Vault secrets
//      (push_gateway_anon_key, project_url) already stored for the push
//      notification trigger — they're generic "reach my own edge
//      functions" values, not push-specific:
//        create trigger bookings_notify_meta_capi
//          after insert on public.bookings
//          for each row execute function public.notify_meta_capi();
//      (mirrors notify_push_new_booking() in schema-v4-push-notifications.sql)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically available to
// every Edge Function — no need to set those manually.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID") ?? "";
const META_CAPI_ACCESS_TOKEN = Deno.env.get("META_CAPI_ACCESS_TOKEN") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

// Meta requires PII (email, phone) sent to CAPI to be SHA-256 hashed,
// lowercased, with phone numbers in E.164-ish digits-only form first.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function digitsOnly(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response(null, { status: 204, headers: CORS_HEADERS }); }

  try {
    if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
      console.error("Meta CAPI not configured — set META_PIXEL_ID and META_CAPI_ACCESS_TOKEN with `supabase secrets set`.");
      return jsonResponse({ ok: false, error: "Meta CAPI not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = body.booking_id;
    if (!bookingId) { return jsonResponse({ ok: false, error: "Missing booking_id" }, 400); }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: booking, error } = await svc.from("bookings").select("*").eq("id", bookingId).single();
    if (error || !booking) { return jsonResponse({ ok: false, error: "Booking not found" }); }

    const userData: Record<string, string[]> = {};
    if (booking.email) { userData.em = [await sha256Hex(booking.email)]; }
    if (booking.phone) { userData.ph = [await sha256Hex(digitsOnly(booking.phone))]; }

    const event = {
      event_name: "Lead",
      event_time: Math.floor(new Date(booking.created_at).getTime() / 1000),
      // Same id the browser pixel used (see meta-pixel.js) — this is what
      // makes Meta merge the two into a single lead instead of double-
      // counting.
      event_id: booking.id,
      action_source: "website",
      event_source_url: "https://southernsudsmobiledetailing.com/#booking",
      user_data: userData,
      custom_data: {
        content_name: booking.service,
        content_category: "Mobile Detailing",
        currency: "USD",
        value: booking.price ?? undefined
      }
    };

    const resp = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] })
    });

    const result = await resp.json();
    if (!resp.ok) {
      console.error("Meta CAPI error:", JSON.stringify(result));
      return jsonResponse({ ok: false, error: result });
    }

    return jsonResponse({ ok: true, meta_response: result });
  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
