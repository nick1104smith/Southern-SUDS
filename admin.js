/* ==========================================================================
   ADMIN DASHBOARD
   ==========================================================================
   Drives admin.html. Gated behind Supabase Auth (email/password) — only
   users listed in public.admins can actually read booking data, enforced
   server-side by Row Level Security, not just by hiding this page. In demo
   mode (no Supabase project configured) login is skipped and local test
   data is shown instead, clearly marked with a banner.
   ========================================================================== */
(function () {
  'use strict';

  // Always start a fresh load of this page at the top (guards against the
  // browser restoring a stale scroll position from bfcache on back/forward).
  if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }
  if (!window.location.hash) { window.scrollTo(0, 0); }

  var SS = window.SSBooking;
  if (!SS) { return; }

  /* ---------------------------------------------------------------------- */
  /* Elements                                                                */
  /* ---------------------------------------------------------------------- */
  var shellEl = document.getElementById('admin-shell');
  var loginBox = document.getElementById('admin-login-box');
  var loginForm = document.getElementById('admin-login-form');
  var loginError = document.getElementById('admin-login-error');
  var demoBanner = document.getElementById('admin-demo-banner');
  var logoutBtn = document.getElementById('admin-logout-btn');

  var sidebar = document.getElementById('admin-sidebar');
  var sidebarBackdrop = document.getElementById('admin-sidebar-backdrop');
  var hamburger = document.getElementById('admin-hamburger');
  var navButtons = Array.prototype.slice.call(document.querySelectorAll('.admin-nav-item[data-view-target]'));
  var topbarTitle = document.getElementById('admin-topbar-title');
  var searchInput = document.getElementById('admin-search-input');

  var themeToggleBtn = document.getElementById('admin-theme-toggle');
  var bellBtn = document.getElementById('admin-bell-btn');
  var bellBadge = document.getElementById('admin-bell-badge');
  var bellDropdown = document.getElementById('admin-bell-dropdown');
  var bellDropdownList = document.getElementById('admin-bell-dropdown-list');
  var bellMarkAllBtn = document.getElementById('admin-bell-mark-all');
  var navUnreadBadge = document.getElementById('admin-nav-unread-badge');

  var detailModal = document.getElementById('admin-detail-modal');
  var detailBox = document.getElementById('admin-detail-box');
  var confirmModal = document.getElementById('admin-confirm-modal');
  var confirmMessageEl = document.getElementById('admin-confirm-message');
  var confirmOkBtn = document.getElementById('admin-confirm-ok');
  var confirmCancelBtn = document.getElementById('admin-confirm-cancel');
  var lightbox = document.getElementById('admin-lightbox');
  var lightboxImg = document.getElementById('admin-lightbox-img');
  var lightboxClose = document.getElementById('admin-lightbox-close');

  /* ---------------------------------------------------------------------- */
  /* State                                                                   */
  /* ---------------------------------------------------------------------- */
  var bookings = [];
  var currentView = 'dashboard';
  var bookingsFilter = 'all';
  var galleryFilter = 'all';
  var searchQuery = '';
  var calendarCursor = new Date();
  var selectedCalendarDate = null;
  var currentDetailId = null;
  var currentUploadCategory = 'other';

  /* ---------------------------------------------------------------------- */
  /* Small helpers                                                          */
  /* ---------------------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtDateTime(iso) {
    if (!iso) { return '—'; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return '—'; }
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function fmtDate(dateStr) {
    if (!dateStr) { return '—'; }
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) { return dateStr; }
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function priceText(b) {
    return b.price !== null && b.price !== undefined
      ? (b.price_is_estimate ? 'Starting at ' : '') + SS.formatMoney(b.price)
      : 'Custom Quote';
  }
  function statusBadge(status) {
    return '<span class="status-badge status-badge--' + escapeHtml(status) + '">' + escapeHtml(SS.STATUS_LABELS[status] || status) + '</span>';
  }

  /* ---------------------------------------------------------------------- */
  /* Theme                                                                   */
  /* ---------------------------------------------------------------------- */
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function applyThemeIcon() { themeToggleBtn.textContent = currentTheme() === 'light' ? '☀️' : '🌙'; }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ss_admin_theme', theme); } catch (e) {}
    applyThemeIcon();
  }
  applyThemeIcon();
  themeToggleBtn.addEventListener('click', function () { setTheme(currentTheme() === 'light' ? 'dark' : 'light'); });

  /* ---------------------------------------------------------------------- */
  /* Sidebar / navigation                                                    */
  /* ---------------------------------------------------------------------- */
  var VIEW_TITLES = { dashboard: 'Dashboard', bookings: 'Bookings', calendar: 'Calendar', customers: 'Customers', gallery: 'Gallery', notifications: 'Notifications', settings: 'Settings' };

  function openSidebar() { sidebar.classList.add('is-open'); sidebarBackdrop.classList.add('is-open'); }
  function closeSidebar() { sidebar.classList.remove('is-open'); sidebarBackdrop.classList.remove('is-open'); }
  hamburger.addEventListener('click', openSidebar);
  sidebarBackdrop.addEventListener('click', closeSidebar);

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.admin-view').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== view; });
    navButtons.forEach(function (btn) { btn.classList.toggle('is-active', btn.getAttribute('data-view-target') === view); });
    topbarTitle.textContent = VIEW_TITLES[view] || 'Dashboard';
    closeSidebar();
    // Sidebar sections aren't separate pages (no router — see admin.js's
    // header comment) — the browser never resets scroll on its own here,
    // so every "page" switch has to do it explicitly. Instant, not smooth:
    // this is a navigation, not a within-page scroll a user should watch.
    window.scrollTo(0, 0);
    renderCurrentView();
  }
  navButtons.forEach(function (btn) {
    btn.addEventListener('click', function () { switchView(btn.getAttribute('data-view-target')); });
  });

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value.trim().toLowerCase();
      if (currentView !== 'bookings') { switchView('bookings'); } else { renderCurrentView(); }
    });
  }

  function renderCurrentView() {
    if (currentView === 'dashboard') { renderDashboard(); }
    else if (currentView === 'bookings') { renderBookingsList(); }
    else if (currentView === 'calendar') { renderCalendar(); }
    else if (currentView === 'customers') { renderCustomers(); }
    else if (currentView === 'gallery') { renderGallery(); }
    else if (currentView === 'notifications') { renderNotifications(); }
  }

  /* ---------------------------------------------------------------------- */
  /* Confirm modal (reused for every destructive action)                    */
  /* ---------------------------------------------------------------------- */
  function confirmAction(message, onConfirm) {
    confirmMessageEl.textContent = message;
    confirmModal.hidden = false;
    var handler = function () {
      confirmModal.hidden = true;
      confirmOkBtn.removeEventListener('click', handler);
      onConfirm();
    };
    confirmOkBtn.addEventListener('click', handler);
  }
  confirmCancelBtn.addEventListener('click', function () { confirmModal.hidden = true; });
  confirmModal.addEventListener('click', function (e) { if (e.target === confirmModal) { confirmModal.hidden = true; } });

  /* ---------------------------------------------------------------------- */
  /* Lightbox                                                                */
  /* ---------------------------------------------------------------------- */
  function openLightbox(url) { lightboxImg.src = url; lightbox.hidden = false; }
  lightboxClose.addEventListener('click', function () { lightbox.hidden = true; lightboxImg.src = ''; });
  lightbox.addEventListener('click', function (e) { if (e.target === lightbox) { lightbox.hidden = true; lightboxImg.src = ''; } });

  /* ---------------------------------------------------------------------- */
  /* Data loading                                                            */
  /* ---------------------------------------------------------------------- */
  function loadBookings() {
    if (SS.DEMO_MODE) {
      bookings = SS.demoGetAll();
      afterLoad();
      return Promise.resolve();
    }
    var client = SS.getClient();
    return client.from('bookings').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.error(res.error); return; }
      bookings = res.data || [];
      afterLoad();
    });
  }

  function afterLoad() {
    updateUnreadBadges();
    renderCurrentView();
  }

  function findBooking(id) {
    for (var i = 0; i < bookings.length; i++) { if (bookings[i].id === id) { return bookings[i]; } }
    return null;
  }

  /* ---------------------------------------------------------------------- */
  /* Unread / notifications                                                  */
  /* ---------------------------------------------------------------------- */
  function unreadBookings() { return bookings.filter(function (b) { return !b.admin_viewed_at; }); }

  function updateUnreadBadges() {
    var count = unreadBookings().length;
    [bellBadge, navUnreadBadge].forEach(function (el) {
      if (!el) { return; }
      el.hidden = count === 0;
      el.textContent = count > 99 ? '99+' : String(count);
    });
    renderBellDropdown();
  }

  function renderBellDropdown() {
    var unread = unreadBookings().slice(0, 8);
    if (!unread.length) {
      bellDropdownList.innerHTML = '<div class="admin-bell-empty">No new booking requests.</div>';
      return;
    }
    bellDropdownList.innerHTML = unread.map(function (b) {
      return '<button type="button" class="admin-bell-dropdown-item" data-id="' + escapeHtml(b.id) + '">' +
        '<div class="abd-name">' + escapeHtml(b.customer_name) + '</div>' +
        '<div class="abd-meta">' + escapeHtml(b.service) + ' · ' + fmtDate(b.requested_date) + '</div>' +
        '</button>';
    }).join('');
    bellDropdownList.querySelectorAll('.admin-bell-dropdown-item').forEach(function (btn) {
      btn.addEventListener('click', function () { bellDropdown.hidden = true; openDetail(btn.getAttribute('data-id')); });
    });
  }

  bellBtn.addEventListener('click', function () { bellDropdown.hidden = !bellDropdown.hidden; });
  document.addEventListener('click', function (e) {
    if (!bellDropdown.hidden && !bellDropdown.contains(e.target) && e.target !== bellBtn) { bellDropdown.hidden = true; }
  });
  bellMarkAllBtn.addEventListener('click', markAllRead);
  document.getElementById('admin-notif-mark-all').addEventListener('click', markAllRead);

  function markViewed(id) {
    var b = findBooking(id);
    if (!b || b.admin_viewed_at) { return; }
    var now = new Date().toISOString();
    b.admin_viewed_at = now;
    updateUnreadBadges();
    if (SS.DEMO_MODE) { SS.demoUpdate(id, { admin_viewed_at: now }); return; }
    SS.getClient().from('bookings').update({ admin_viewed_at: now }).eq('id', id).then(function (res) {
      if (res.error) { console.error(res.error); }
    });
  }

  function markAllRead() {
    var unread = unreadBookings();
    if (!unread.length) { return; }
    var now = new Date().toISOString();
    unread.forEach(function (b) { b.admin_viewed_at = now; });
    updateUnreadBadges();
    renderCurrentView();
    if (SS.DEMO_MODE) {
      unread.forEach(function (b) { SS.demoUpdate(b.id, { admin_viewed_at: now }); });
      return;
    }
    var ids = unread.map(function (b) { return b.id; });
    SS.getClient().from('bookings').update({ admin_viewed_at: now }).in('id', ids).then(function (res) {
      if (res.error) { console.error(res.error); }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Browser notifications + Realtime                                        */
  /* ---------------------------------------------------------------------- */
  function requestNotificationPermission() {
    if (!('Notification' in window)) { return; }
    if (Notification.permission === 'default') { Notification.requestPermission(); }
  }

  function notifyNewBooking(b) {
    document.title = '🔴 New Booking! — Southern Suds Admin';
    var resetTitle = function () {
      document.title = 'Admin Dashboard | Southern Suds Mobile Detailing';
      document.removeEventListener('visibilitychange', onVisible);
    };
    var onVisible = function () { if (!document.hidden) { resetTitle(); } };
    document.addEventListener('visibilitychange', onVisible);

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        var n = new Notification('New booking request', {
          body: b.customer_name + ' — ' + b.service + '\n' + fmtDate(b.requested_date) + ' · ' + priceText(b),
          icon: 'images/logo.png'
        });
        n.onclick = function () { window.focus(); openDetail(b.id); n.close(); };
      } catch (e) { /* ignore — some browsers restrict Notification outside a user gesture */ }
    }
  }

  function subscribeRealtime() {
    if (SS.DEMO_MODE) { return; }
    var client = SS.getClient();
    client.channel('admin-bookings-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, function (payload) {
        var row = payload.new;
        if (findBooking(row.id)) { return; }
        bookings.unshift(row);
        updateUnreadBadges();
        renderCurrentView();
        notifyNewBooking(row);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, function (payload) {
        var row = payload.new;
        var existing = findBooking(row.id);
        if (existing) { Object.assign(existing, row); }
        updateUnreadBadges();
        renderCurrentView();
      })
      .subscribe();
  }

  /* ---------------------------------------------------------------------- */
  /* Booking card / row rendering                                           */
  /* ---------------------------------------------------------------------- */
  function bookingCardHTML(b) {
    return (
      '<article class="admin-booking-card' + (b.status === 'pending' ? ' is-pending' : '') + '" data-id="' + escapeHtml(b.id) + '">' +
        '<div class="admin-card-top">' +
          '<div><h3>' + escapeHtml(b.customer_name) + (b.admin_viewed_at ? '' : ' 🔴') + '</h3>' +
          '<p class="admin-card-sub">' + escapeHtml(b.service) + '</p></div>' +
          statusBadge(b.status) +
        '</div>' +
        '<div class="admin-card-grid">' +
          '<div><span class="k">Phone</span><a href="tel:' + escapeHtml(b.phone) + '" onclick="event.stopPropagation()">' + escapeHtml(b.phone) + '</a></div>' +
          '<div><span class="k">Vehicle</span>' + escapeHtml(b.vehicle_type) + '</div>' +
          '<div><span class="k">Price</span>' + priceText(b) + '</div>' +
          '<div><span class="k">Requested</span>' + fmtDate(b.requested_date) + ' — ' + escapeHtml(b.requested_time) + '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function rowHTML(b) {
    return (
      '<div class="admin-row" data-id="' + escapeHtml(b.id) + '">' +
        '<div class="admin-row-main">' +
          '<div class="admin-row-name">' + escapeHtml(b.customer_name) + (b.admin_viewed_at ? '' : ' 🔴') + '</div>' +
          '<div class="admin-row-meta">' + escapeHtml(b.service) + ' · ' + fmtDate(b.requested_date) + ' · ' + escapeHtml(b.requested_time) + '</div>' +
        '</div>' +
        statusBadge(b.status) +
        '<span class="admin-row-price">' + priceText(b) + '</span>' +
      '</div>'
    );
  }

  function bindRowClicks(container) {
    container.querySelectorAll('[data-id]').forEach(function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-id')); });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Dashboard view                                                          */
  /* ---------------------------------------------------------------------- */
  function renderDashboard() {
    var today = todayStr();
    var todayCount = bookings.filter(function (b) { return b.requested_date === today && b.status === 'confirmed'; }).length;
    var pendingCount = bookings.filter(function (b) { return b.status === 'pending'; }).length;
    var confirmedCount = bookings.filter(function (b) { return b.status === 'confirmed'; }).length;
    var completedCount = bookings.filter(function (b) { return b.status === 'completed'; }).length;
    var totalRevenue = bookings.filter(function (b) { return b.status === 'completed'; })
      .reduce(function (sum, b) { return sum + (Number(b.price) || 0); }, 0);
    var upcomingCount = bookings.filter(function (b) { return b.status === 'confirmed' && b.requested_date >= today; }).length;

    var cards = [
      { icon: '📅', value: todayCount, label: "Today's Appointments" },
      { icon: '⏳', value: pendingCount, label: 'Pending Requests', highlight: pendingCount > 0 },
      { icon: '✅', value: confirmedCount, label: 'Confirmed Appointments' },
      { icon: '🏁', value: completedCount, label: 'Completed Jobs' },
      { icon: '💰', value: SS.formatMoney(totalRevenue) || '$0', label: 'Total Revenue' },
      { icon: '📈', value: upcomingCount, label: 'Upcoming Appointments' }
    ];
    document.getElementById('admin-summary-grid').innerHTML = cards.map(function (c) {
      return '<div class="admin-summary-card' + (c.highlight ? ' is-highlight' : '') + '">' +
        '<div class="admin-summary-card-icon">' + c.icon + '</div>' +
        '<div class="admin-summary-card-value">' + c.value + '</div>' +
        '<div class="admin-summary-card-label">' + c.label + '</div>' +
      '</div>';
    }).join('');

    var pendingList = bookings.filter(function (b) { return b.status === 'pending'; }).slice(0, 6);
    var pendingEl = document.getElementById('admin-pending-list');
    pendingEl.innerHTML = pendingList.length ? pendingList.map(rowHTML).join('') : '<p class="admin-booking-card-empty">Nothing pending — you\'re all caught up.</p>';
    bindRowClicks(pendingEl);

    var upcomingList = bookings.filter(function (b) { return b.status === 'confirmed' && b.requested_date >= today; })
      .sort(function (a, c) { return a.requested_date.localeCompare(c.requested_date); }).slice(0, 6);
    var upcomingEl = document.getElementById('admin-upcoming-list');
    upcomingEl.innerHTML = upcomingList.length ? upcomingList.map(rowHTML).join('') : '<p class="admin-booking-card-empty">No confirmed upcoming appointments yet.</p>';
    bindRowClicks(upcomingEl);

    var recentList = bookings.slice(0, 6);
    var recentEl = document.getElementById('admin-recent-list');
    recentEl.innerHTML = recentList.length ? recentList.map(rowHTML).join('') : '<p class="admin-booking-card-empty">No bookings yet.</p>';
    bindRowClicks(recentEl);
  }

  /* ---------------------------------------------------------------------- */
  /* Bookings list view                                                      */
  /* ---------------------------------------------------------------------- */
  var filterTabs = Array.prototype.slice.call(document.querySelectorAll('#admin-filter-tabs .admin-filter-tab'));
  filterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      filterTabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      bookingsFilter = tab.getAttribute('data-status');
      renderBookingsList();
    });
  });
  document.getElementById('admin-refresh-btn').addEventListener('click', loadBookings);

  function matchesSearch(b) {
    if (!searchQuery) { return true; }
    var haystack = (b.customer_name + ' ' + b.phone + ' ' + b.email + ' ' + b.id).toLowerCase();
    return haystack.indexOf(searchQuery) !== -1;
  }

  function renderBookingsList() {
    var filtered = bookings.filter(function (b) {
      return (bookingsFilter === 'all' || b.status === bookingsFilter) && matchesSearch(b);
    });
    var emptyMsg = document.getElementById('admin-empty-msg');
    emptyMsg.hidden = filtered.length > 0;
    var listEl = document.getElementById('admin-booking-list');
    listEl.innerHTML = filtered.map(bookingCardHTML).join('');
    bindRowClicks(listEl);
  }

  /* ---------------------------------------------------------------------- */
  /* Calendar view                                                          */
  /* ---------------------------------------------------------------------- */
  var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  document.getElementById('admin-cal-prev').addEventListener('click', function () {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('admin-cal-next').addEventListener('click', function () {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar();
  });

  function bookingsByDate() {
    var map = {};
    bookings.forEach(function (b) {
      if (!b.requested_date) { return; }
      (map[b.requested_date] = map[b.requested_date] || []).push(b);
    });
    return map;
  }

  function renderCalendar() {
    var year = calendarCursor.getFullYear();
    var month = calendarCursor.getMonth();
    document.getElementById('admin-cal-label').textContent = MONTH_NAMES[month] + ' ' + year;

    var firstOfMonth = new Date(year, month, 1);
    var startOffset = firstOfMonth.getDay();
    var gridStart = new Date(year, month, 1 - startOffset);
    var byDate = bookingsByDate();
    var today = todayStr();

    var cells = WEEKDAYS.map(function (w) { return '<div class="admin-calendar-weekday">' + w + '</div>'; });

    for (var i = 0; i < 42; i++) {
      var cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      var cellStr = cellDate.getFullYear() + '-' + pad2(cellDate.getMonth() + 1) + '-' + pad2(cellDate.getDate());
      var isOtherMonth = cellDate.getMonth() !== month;
      var dayBookings = byDate[cellStr] || [];
      var dots = dayBookings.slice(0, 6).map(function (b) { return '<span class="admin-calendar-dot admin-calendar-dot--' + b.status + '"></span>'; }).join('');

      cells.push(
        '<div class="admin-calendar-daycell' +
          (isOtherMonth ? ' is-other-month' : '') +
          (cellStr === today ? ' is-today' : '') +
          (cellStr === selectedCalendarDate ? ' is-selected' : '') +
          '" data-date="' + cellStr + '">' +
          '<span class="admin-calendar-day-num">' + cellDate.getDate() + '</span>' +
          '<div class="admin-calendar-dots">' + dots + '</div>' +
        '</div>'
      );
    }
    var gridEl = document.getElementById('admin-cal-grid');
    gridEl.innerHTML = cells.join('');
    gridEl.querySelectorAll('.admin-calendar-daycell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        selectedCalendarDate = cell.getAttribute('data-date');
        renderCalendar();
      });
    });

    var detailEl = document.getElementById('admin-cal-day-detail');
    if (!selectedCalendarDate) { detailEl.innerHTML = ''; return; }
    var dayList = byDate[selectedCalendarDate] || [];
    var heading = '<div class="admin-section-title">' + fmtDate(selectedCalendarDate) + '</div>';
    detailEl.innerHTML = heading + (dayList.length
      ? '<div class="admin-row-list">' + dayList.map(rowHTML).join('') + '</div>'
      : '<p class="admin-booking-card-empty">No appointments this day.</p>');
    bindRowClicks(detailEl);
  }

  /* ---------------------------------------------------------------------- */
  /* Customers view (derived from bookings — grouped by email)              */
  /* ---------------------------------------------------------------------- */
  function renderCustomers() {
    var groups = {};
    bookings.forEach(function (b) {
      var key = (b.email || b.phone || b.customer_name).toLowerCase();
      if (!groups[key]) { groups[key] = { name: b.customer_name, email: b.email, phone: b.phone, bookings: [] }; }
      groups[key].bookings.push(b);
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; });
    list.sort(function (a, c) { return c.bookings.length - a.bookings.length; });

    var el = document.getElementById('admin-customer-list');
    if (!list.length) { el.innerHTML = '<p class="admin-booking-card-empty">No customers yet.</p>'; return; }

    el.innerHTML = list.map(function (cust) {
      var spent = cust.bookings.filter(function (b) { return b.status === 'completed'; })
        .reduce(function (sum, b) { return sum + (Number(b.price) || 0); }, 0);
      var lastDate = cust.bookings.map(function (b) { return b.created_at; }).sort().slice(-1)[0];
      return (
        '<div class="admin-customer-card" data-email="' + escapeHtml(cust.email || '') + '">' +
          '<h3>' + escapeHtml(cust.name) + '</h3>' +
          '<div class="acc-meta">' + escapeHtml(cust.phone) + (cust.email ? ' · ' + escapeHtml(cust.email) : '') + '</div>' +
          '<div class="acc-meta">Last booking: ' + fmtDateTime(lastDate) + '</div>' +
          '<div class="acc-stats"><span>' + cust.bookings.length + ' booking(s)</span><span>' + SS.formatMoney(spent) + ' spent</span></div>' +
        '</div>'
      );
    }).join('');

    el.querySelectorAll('.admin-customer-card').forEach(function (card) {
      card.addEventListener('click', function () {
        searchInput.value = card.querySelector('h3').textContent;
        searchQuery = searchInput.value.trim().toLowerCase();
        switchView('bookings');
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Gallery view (all photos across all bookings)                          */
  /* ---------------------------------------------------------------------- */
  var galleryFilterTabs = Array.prototype.slice.call(document.querySelectorAll('#admin-gallery-filter-tabs .admin-filter-tab'));
  galleryFilterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      galleryFilterTabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      galleryFilter = tab.getAttribute('data-cat');
      renderGallery();
    });
  });

  function allPhotosWithContext() {
    if (SS.DEMO_MODE) {
      var out = [];
      bookings.forEach(function (b) {
        (b.photos || []).forEach(function (p) { out.push(Object.assign({}, p, { _booking: b })); });
      });
      out.sort(function (a, c) { return (c.created_at || '').localeCompare(a.created_at || ''); });
      return Promise.resolve(out);
    }
    var client = SS.getClient();
    return client.from('booking_photos').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.error(res.error); return []; }
      return (res.data || []).map(function (p) { return Object.assign({}, p, { _booking: findBooking(p.booking_id) }); });
    });
  }

  function renderGallery() {
    var gridEl = document.getElementById('admin-gallery-grid');
    gridEl.innerHTML = '<p class="admin-gallery-empty">Loading photos…</p>';
    allPhotosWithContext().then(function (photos) {
      var filtered = galleryFilter === 'all' ? photos : photos.filter(function (p) { return p.category === galleryFilter; });
      if (!filtered.length) { gridEl.innerHTML = '<p class="admin-gallery-empty">No photos yet.</p>'; return; }
      Promise.all(filtered.map(function (p) { return SS.getPhotoUrl(p).catch(function () { return ''; }); })).then(function (urls) {
        gridEl.innerHTML = filtered.map(function (p, i) {
          var name = p._booking ? escapeHtml(p._booking.customer_name) : '';
          return '<div class="admin-gallery-item" data-url="' + escapeHtml(urls[i]) + '" title="' + name + '">' +
            '<img src="' + escapeHtml(urls[i]) + '" alt="' + name + ' photo" loading="lazy">' +
            '<span class="admin-gallery-item-badge">' + SS.PHOTO_CATEGORY_LABELS[p.category] + '</span>' +
          '</div>';
        }).join('');
        gridEl.querySelectorAll('.admin-gallery-item').forEach(function (item) {
          item.addEventListener('click', function () { openLightbox(item.getAttribute('data-url')); });
        });
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Notifications view                                                      */
  /* ---------------------------------------------------------------------- */
  function renderNotifications() {
    var list = unreadBookings();
    var el = document.getElementById('admin-notif-list');
    el.innerHTML = list.length ? list.map(rowHTML).join('') : '<p class="admin-booking-card-empty">You\'re all caught up — no unread booking requests.</p>';
    bindRowClicks(el);
  }

  /* ---------------------------------------------------------------------- */
  /* Booking detail modal                                                    */
  /* ---------------------------------------------------------------------- */
  function statusActionButtons(b) {
    var buttons = [];
    if (b.status !== 'confirmed') { buttons.push('<button type="button" class="btn btn-success" data-action="confirmed">Confirm Booking</button>'); }
    if (b.status !== 'declined') { buttons.push('<button type="button" class="btn btn-danger" data-action="declined">Decline Booking</button>'); }
    if (b.status !== 'completed') { buttons.push('<button type="button" class="btn btn-success" data-action="completed">Mark Completed</button>'); }
    if (b.status !== 'cancelled') { buttons.push('<button type="button" class="btn btn-muted" data-action="cancelled">Cancel Booking</button>'); }
    buttons.push('<button type="button" class="btn btn-secondary" id="admin-edit-toggle">Edit Booking</button>');
    return buttons.join('');
  }

  function renderPhotoGallery(b) {
    SS.getPhotos(b.id).then(function (photos) {
      var galleryEl = document.getElementById('admin-detail-photo-gallery');
      if (!galleryEl) { return; }
      if (!photos.length) { galleryEl.innerHTML = '<p class="admin-photo-empty">No photos yet.</p>'; return; }
      Promise.all(photos.map(function (p) { return SS.getPhotoUrl(p).catch(function () { return ''; }); })).then(function (urls) {
        galleryEl.innerHTML = photos.map(function (p, i) {
          return '<div class="admin-photo-thumb" data-id="' + escapeHtml(p.id) + '" data-url="' + escapeHtml(urls[i]) + '">' +
            '<img src="' + escapeHtml(urls[i]) + '" alt="' + SS.PHOTO_CATEGORY_LABELS[p.category] + ' photo" loading="lazy">' +
            '<span class="admin-photo-thumb-badge">' + SS.PHOTO_CATEGORY_LABELS[p.category] + '</span>' +
            '<button type="button" class="admin-photo-thumb-delete" data-id="' + escapeHtml(p.id) + '" aria-label="Delete photo">&times;</button>' +
          '</div>';
        }).join('');
        galleryEl.querySelectorAll('.admin-photo-thumb img').forEach(function (img) {
          img.addEventListener('click', function () { openLightbox(img.closest('.admin-photo-thumb').getAttribute('data-url')); });
        });
        galleryEl.querySelectorAll('.admin-photo-thumb-delete').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var photoId = btn.getAttribute('data-id');
            var photo = photos.filter(function (p) { return p.id === photoId; })[0];
            confirmAction('Permanently delete this photo? This cannot be undone.', function () {
              SS.deletePhoto(b.id, photo).then(function () { renderPhotoGallery(b); })
                .catch(function (err) { alert('Could not delete photo: ' + err.message); });
            });
          });
        });
      });
    });
  }

  function wirePhotoUpload(b) {
    var chips = document.querySelectorAll('.admin-photo-category-chip');
    currentUploadCategory = 'other';
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        currentUploadCategory = chip.getAttribute('data-cat');
      });
    });
    var fileInput = document.getElementById('admin-photo-upload-input');
    var progressEl = document.getElementById('admin-photo-upload-progress');
    var zone = document.getElementById('admin-photo-upload-zone');

    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = '';
      if (!files.length) { return; }
      var errors = [];
      var valid = files.filter(function (f) {
        var err = SS.validateImageFile(f);
        if (err) { errors.push(f.name + ': ' + err); return false; }
        return true;
      });
      if (errors.length) { progressEl.textContent = errors.join(' '); }
      if (!valid.length) { return; }

      var done = 0;
      progressEl.textContent = 'Uploading 0/' + valid.length + '…';
      Promise.all(valid.map(function (f) {
        return SS.uploadPhoto(b.id, f, currentUploadCategory, 'admin').then(function (r) {
          done++; progressEl.textContent = 'Uploading ' + done + '/' + valid.length + '…';
          return r;
        }).catch(function (err) {
          done++; console.error(err); return null;
        });
      })).then(function (results) {
        var ok = results.filter(Boolean).length;
        progressEl.textContent = ok + ' of ' + valid.length + ' photo(s) uploaded.';
        renderPhotoGallery(b);
      });
    });

    ['dragover', 'dragenter'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.add('is-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.remove('is-dragover'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
  }

  function openDetail(id) {
    var b = findBooking(id);
    if (!b) { return; }
    currentDetailId = id;
    markViewed(id);

    detailBox.innerHTML =
      '<button type="button" class="modal-close" data-close-modal aria-label="Close">&times;</button>' +
      '<div class="admin-detail-header">' +
        '<div><h3>' + escapeHtml(b.customer_name) + '</h3><div class="admin-detail-created">Requested ' + fmtDateTime(b.created_at) + '</div></div>' +
        statusBadge(b.status) +
      '</div>' +
      '<div class="admin-detail-grid">' +
        '<div class="admin-detail-field"><span class="k">Phone</span><span class="v"><a href="tel:' + escapeHtml(b.phone) + '">' + escapeHtml(b.phone) + '</a></span></div>' +
        '<div class="admin-detail-field"><span class="k">Email</span><span class="v"><a href="mailto:' + escapeHtml(b.email) + '">' + escapeHtml(b.email) + '</a></span></div>' +
        '<div class="admin-detail-field"><span class="k">Address</span><span class="v">' + escapeHtml(b.address) + '</span></div>' +
        '<div class="admin-detail-field"><span class="k">Service</span><span class="v">' + escapeHtml(b.service) + '</span></div>' +
        '<div class="admin-detail-field"><span class="k">Vehicle</span><span class="v">' + escapeHtml(b.vehicle_type) + '</span></div>' +
        '<div class="admin-detail-field"><span class="k">Price</span><span class="v">' + priceText(b) + '</span></div>' +
        '<div class="admin-detail-field"><span class="k">Requested Date</span><span class="v">' + fmtDate(b.requested_date) + '</span></div>' +
        '<div class="admin-detail-field"><span class="k">Requested Time</span><span class="v">' + escapeHtml(b.requested_time) + '</span></div>' +
      '</div>' +
      '<div class="admin-detail-notes">' + (b.notes ? escapeHtml(b.notes) : 'No customer notes.') + '</div>' +
      '<div class="admin-edit-form" id="admin-edit-form" hidden>' +
        '<div class="form-grid">' +
          '<div class="form-group"><label>Requested Date</label><input type="date" id="edit-date" value="' + escapeHtml(b.requested_date) + '"></div>' +
          '<div class="form-group"><label>Requested Time</label><input type="text" id="edit-time" value="' + escapeHtml(b.requested_time) + '"></div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label><textarea id="edit-notes" rows="3">' + escapeHtml(b.notes || '') + '</textarea></div>' +
        '<div class="booking-step-nav" style="margin-top:0.8em;">' +
          '<button type="button" class="btn btn-secondary" id="admin-edit-cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary" id="admin-edit-save">Save Changes</button>' +
        '</div>' +
      '</div>' +
      '<div class="admin-detail-actions">' + statusActionButtons(b) + '</div>' +
      '<div class="admin-photo-section">' +
        '<h4>Photos</h4>' +
        '<div class="admin-photo-category-picker">' +
          SS.PHOTO_CATEGORIES.map(function (c) { return '<button type="button" class="admin-photo-category-chip' + (c === 'other' ? ' is-active' : '') + '" data-cat="' + c + '">' + SS.PHOTO_CATEGORY_LABELS[c] + '</button>'; }).join('') +
        '</div>' +
        '<div class="admin-photo-upload-zone" id="admin-photo-upload-zone">' +
          '<input type="file" id="admin-photo-upload-input" accept="image/jpeg,image/png,image/webp" multiple>' +
          '<span>📷 Drop photos here or tap to upload</span>' +
          '<div class="admin-photo-upload-hint">JPG, PNG, or WebP — up to 8MB each</div>' +
          '<div class="admin-photo-upload-progress" id="admin-photo-upload-progress"></div>' +
        '</div>' +
        '<div class="admin-photo-gallery" id="admin-detail-photo-gallery"><p class="admin-photo-empty">Loading…</p></div>' +
      '</div>';

    detailModal.hidden = false;
    // .modal-box scrolls internally (max-height + overflow-y: auto) — reset
    // it explicitly so reopening a booking (or opening a different one)
    // never starts scrolled partway down from a previous view.
    detailBox.scrollTop = 0;
    detailBox.querySelector('.modal-close').addEventListener('click', function () { detailModal.hidden = true; });

    detailBox.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var status = btn.getAttribute('data-action');
        if (status === 'declined' || status === 'cancelled') {
          confirmAction('Mark this booking as ' + SS.STATUS_LABELS[status] + '? The customer will need to be notified separately.', function () { setStatus(b.id, status); });
        } else {
          setStatus(b.id, status);
        }
      });
    });

    var editToggle = document.getElementById('admin-edit-toggle');
    var editForm = document.getElementById('admin-edit-form');
    editToggle.addEventListener('click', function () { editForm.hidden = !editForm.hidden; });
    document.getElementById('admin-edit-cancel').addEventListener('click', function () { editForm.hidden = true; });
    document.getElementById('admin-edit-save').addEventListener('click', function () {
      var patch = {
        requested_date: document.getElementById('edit-date').value,
        requested_time: document.getElementById('edit-time').value,
        notes: document.getElementById('edit-notes').value
      };
      updateBooking(b.id, patch).then(function () { editForm.hidden = true; openDetail(b.id); });
    });

    wirePhotoUpload(b);
    renderPhotoGallery(b);
  }

  detailModal.addEventListener('click', function (e) { if (e.target === detailModal) { detailModal.hidden = true; } });

  function setStatus(id, status) {
    updateBooking(id, { status: status });
  }

  function updateBooking(id, patch) {
    var existing = findBooking(id);
    if (existing) { Object.assign(existing, patch); }
    renderCurrentView();
    updateUnreadBadges();

    if (SS.DEMO_MODE) {
      SS.demoUpdate(id, patch);
      return Promise.resolve();
    }
    return SS.getClient().from('bookings').update(patch).eq('id', id).then(function (res) {
      if (res.error) { alert('Could not save changes: ' + res.error.message); }
      return res;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Auth                                                                    */
  /* ---------------------------------------------------------------------- */
  function showDashboard(email) {
    loginBox.hidden = true;
    shellEl.hidden = false;
    var settingsEmail = document.getElementById('admin-settings-email');
    if (settingsEmail && email) { settingsEmail.textContent = email; }
    requestNotificationPermission();
    loadBookings();
    subscribeRealtime();
  }
  function showLogin() {
    loginBox.hidden = false;
    shellEl.hidden = true;
  }

  if (SS.DEMO_MODE) {
    demoBanner.hidden = false;
    showDashboard('demo@southernsuds.local');
  } else {
    var client = SS.getClient();
    if (!client) { showLogin(); }
    else {
      client.auth.getSession().then(function (res) {
        if (res.data && res.data.session) { showDashboard(res.data.session.user.email); } else { showLogin(); }
      });

      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (loginError) { loginError.textContent = ''; }
        var email = document.getElementById('admin-email').value.trim();
        var password = document.getElementById('admin-password').value;
        client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
          if (res.error) { if (loginError) { loginError.textContent = res.error.message; } return; }
          showDashboard(email);
        });
      });

      logoutBtn.addEventListener('click', function () {
        client.auth.signOut().then(function () { showLogin(); });
      });
    }
  }
})();
