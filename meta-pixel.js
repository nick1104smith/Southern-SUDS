/* ==========================================================================
   META PIXEL — client-side conversion tracking
   ==========================================================================
   Loaded on customer-facing pages only (index.html, booking-new.html) —
   never on admin.html, since staff actions aren't customer conversions.

   Until a real META_PIXEL_ID is set in supabase-config.js, this file
   no-ops entirely (same demo-mode pattern used everywhere else on this
   site) — nothing fires to a placeholder pixel, and nothing errors.

   Event funnel, in the order they actually happen:
     PageView            — automatic, every page load (standard Pixel base
                            code behavior)
     ViewContent         — the booking section scrolls into view. This is
                            a passive "reached the booking page" signal —
                            NOT counted as a lead, just useful later for a
                            "booking page viewers" retargeting audience.
     InitiateCheckout    — the customer advances past Step 1 (picked a
                            service and clicked Continue). Represents real
                            engagement — this is the group worth
                            retargeting hardest later, since they showed
                            intent but may not have finished.
     Lead                 — the booking was actually saved to Supabase.
                            This is the ONLY event that should ever be the
                            optimization/conversion event in Ads Manager.
                            It fires exactly once, only after a genuine
                            appointment request succeeds — never on page
                            load, never on merely opening the form.
   ========================================================================== */
(function () {
  'use strict';

  var PIXEL_ID = window.META_PIXEL_ID;
  var configured = !!PIXEL_ID && PIXEL_ID.indexOf('YOUR_META') === -1;
  window.SS_PIXEL_ENABLED = configured;

  if (!configured) {
    // No-op stand-ins so booking-new.js never has to check "is the pixel
    // configured?" itself before calling these.
    window.ssTrackViewContent = function () {};
    window.ssTrackInitiateCheckout = function () {};
    window.ssTrackLead = function () {};
    return;
  }

  /* Standard Meta Pixel base code (unmodified, from Events Manager). */
  /* eslint-disable */
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');
  /* eslint-enable */

  var firedViewContent = false;
  window.ssTrackViewContent = function () {
    if (firedViewContent) { return; }
    firedViewContent = true;
    fbq('track', 'ViewContent', { content_name: 'Booking Form', content_category: 'Mobile Detailing' });
  };

  var firedInitiateCheckout = false;
  window.ssTrackInitiateCheckout = function () {
    if (firedInitiateCheckout) { return; }
    firedInitiateCheckout = true;
    fbq('track', 'InitiateCheckout', { content_name: 'Booking Form', content_category: 'Mobile Detailing' });
  };

  // Not deduplicated by a flag — a customer could legitimately submit more
  // than one request in a session (e.g. two vehicles) — but booking-new.js
  // only ever calls this once per successful insert, so a real double-fire
  // would mean a real second lead, not a bug.
  window.ssTrackLead = function (payload) {
    var params = { content_name: (payload && payload.service) || 'Mobile Detailing Booking', content_category: 'Mobile Detailing', currency: 'USD' };
    if (payload && typeof payload.value === 'number') { params.value = payload.value; }
    // eventID (matched against the same id the future server-side
    // Conversions API call will use — the booking's own UUID) is how Meta
    // deduplicates a browser + server event pair into one lead instead of
    // counting it twice once CAPI is active.
    var options = payload && payload.eventId ? { eventID: payload.eventId } : undefined;
    fbq('track', 'Lead', params, options);
  };
})();
