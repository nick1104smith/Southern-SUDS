/* ==========================================================================
   SUPABASE CONFIG — loaded by booking-new.html and admin.html
   ==========================================================================
   SUPABASE_URL and SUPABASE_ANON_KEY are meant to be public. Supabase's
   "anon" key is safe to ship in frontend code as long as Row Level Security
   is configured correctly (see supabase/schema.sql) — it is NOT the same as
   the service_role key, which bypasses RLS entirely and must NEVER appear
   in any file that ships to the browser (this one included).

   Until you paste real values in below, booking-new.html and admin.html
   both automatically run in DEMO MODE, using your browser's localStorage as
   a stand-in database. That lets you preview the full customer + admin
   experience right now, before creating a Supabase project. See
   BOOKING-V2-SETUP.md for how to get these two values once you're ready to
   connect the real backend (still on localhost, nothing is deployed by
   filling these in).
   ========================================================================== */
window.SUPABASE_URL = 'https://gorphrtoafpbelbdffqd.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvcnBocnRvYWZwYmVsYmRmZnFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTcwODcsImV4cCI6MjEwMjA3MzA4N30.Q6KsiakjJPxaCJV22DtQo9BExuForUCc6ixtaeH-WOE';

// The VAPID "application server key" for Web Push. Like the anon key above,
// this is meant to be public — it's what the browser's push service uses to
// confirm push messages actually come from this app; the matching PRIVATE
// key lives only in the send-push-notification Edge Function's secrets and
// is never in any file that reaches the browser.
window.VAPID_PUBLIC_KEY = 'BAbx_Z1O1mJ0R9zU0UYAGN41mugn-61iZx-R6ieAQp1cJg_FNxl1np8GhNxBD3z6UwiBmdn5I_Z53FBN4X_z8i4';
