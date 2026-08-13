/* ==========================================================================
   ADMIN DASHBOARD — SERVICE WORKER
   ==========================================================================
   Two jobs: (1) let admin.html be installed as a standalone app (required
   by the browser for a page to be "installable"), and (2) receive and
   display Web Push notifications, including when the dashboard tab isn't
   open at all. No caching/offline strategy is implemented — the dashboard
   needs a live network connection to Supabase anyway, so there's nothing
   meaningful to serve offline.
   ========================================================================== */

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

/* ---- Incoming push message -> OS notification -------------------------- */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

  var title = data.title || 'Southern Suds';
  var options = {
    body: data.body || '',
    icon: 'images/logo.png',
    badge: 'images/logo.png',
    tag: data.url || 'southern-suds-notification', // replaces a still-visible notification for the same booking instead of stacking duplicates
    data: { url: data.url || '/admin.html' },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ---- Tap a notification -> open/focus the dashboard at the right booking */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/admin.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          // Reuse an already-open dashboard tab/window instead of piling up
          // new ones — navigate it to the booking, then focus it.
          if ('navigate' in client) { client.navigate(targetUrl); }
          return client.focus();
        }
      }
      if (self.clients.openWindow) { return self.clients.openWindow(targetUrl); }
    })
  );
});
