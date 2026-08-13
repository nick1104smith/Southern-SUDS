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
  var VIEW_TITLES = { dashboard: 'Dashboard', bookings: 'Bookings', calendar: 'Calendar', customers: 'Customers', revenue: 'Revenue', gallery: 'Gallery', notifications: 'Notifications', settings: 'Settings' };

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
    else if (currentView === 'revenue') { renderRevenue(); }
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
    var completedAll = bookings.filter(function (b) { return b.status === 'completed'; });
    var totalRevenue = completedAll.reduce(function (s, b) { return s + serviceRevenueOf(b); }, 0);
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

    var thisMonthStart = today.slice(0, 7) + '-01';
    var monthRevenue = completedAll.filter(function (b) { return revenueDateStr(b) >= thisMonthStart; })
      .reduce(function (s, b) { return s + serviceRevenueOf(b); }, 0);
    var promoValueEl = document.getElementById('admin-revenue-promo-value');
    if (promoValueEl) { promoValueEl.textContent = SS.formatMoney(monthRevenue) || '$0'; }
  }
  var revenuePromoCard = document.getElementById('admin-revenue-promo-card');
  if (revenuePromoCard) { revenuePromoCard.addEventListener('click', function () { switchView('revenue'); }); }

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

  function paymentSummaryHTML(b) {
    var methodLabel = b.payment_method ? SS.PAYMENT_METHOD_LABELS[b.payment_method] : '—';
    return (
      '<div class="admin-payment-summary">' +
        '<h4>Payment</h4>' +
        '<div class="admin-detail-grid">' +
          '<div class="admin-detail-field"><span class="k">Original Booking Price</span><span class="v">' + priceText(b) + '</span></div>' +
          '<div class="admin-detail-field"><span class="k">Final Service Price</span><span class="v">' + SS.formatMoney(b.final_price) + '</span></div>' +
          '<div class="admin-detail-field"><span class="k">Tip</span><span class="v">' + SS.formatMoney(b.tip_amount || 0) + '</span></div>' +
          '<div class="admin-detail-field"><span class="k">Total Collected</span><span class="v" style="color:var(--a-accent-bright); font-weight:800;">' + SS.formatMoney(b.total_collected) + '</span></div>' +
          '<div class="admin-detail-field"><span class="k">Payment Method</span><span class="v">' + escapeHtml(methodLabel) + '</span></div>' +
          '<div class="admin-detail-field"><span class="k">Payment Date</span><span class="v">' + (b.payment_date ? fmtDate(b.payment_date) : '—') + '</span></div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---- "Mark Completed" payment capture ---------------------------------- */
  function openCompleteJobModal(b) {
    var box = document.getElementById('admin-complete-box');
    var defaultPrice = b.final_price !== null && b.final_price !== undefined ? b.final_price : (b.price !== null && b.price !== undefined ? b.price : '');
    var defaultTip = b.tip_amount || 0;
    var defaultDate = b.payment_date || b.requested_date || todayStr();

    box.innerHTML =
      '<button type="button" class="modal-close" data-close-modal aria-label="Close">&times;</button>' +
      '<h3>Complete This Job</h3>' +
      '<p style="color:var(--a-text-muted); font-size:var(--fs-sm); margin-bottom:1em;">' + escapeHtml(b.customer_name) + ' — ' + escapeHtml(b.service) + (b.price !== null && b.price !== undefined ? ' (originally ' + priceText(b) + ')' : '') + '</p>' +
      '<div class="form-grid">' +
        '<div class="form-group"><label>Final Service Price ($)</label><input type="number" step="0.01" min="0" id="complete-final-price" value="' + escapeHtml(String(defaultPrice)) + '"></div>' +
        '<div class="form-group"><label>Tip Amount ($)</label><input type="number" step="0.01" min="0" id="complete-tip" value="' + escapeHtml(String(defaultTip)) + '"></div>' +
        '<div class="form-group"><label>Payment Method</label><select id="complete-payment-method"><option value="">Select one</option>' +
          SS.PAYMENT_METHODS.map(function (m) { return '<option value="' + m + '"' + (b.payment_method === m ? ' selected' : '') + '>' + SS.PAYMENT_METHOD_LABELS[m] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="form-group"><label>Payment Date</label><input type="date" id="complete-payment-date" value="' + escapeHtml(defaultDate) + '"></div>' +
      '</div>' +
      '<p class="admin-complete-total" id="complete-total-preview"></p>' +
      '<p class="field-error" id="complete-error"></p>' +
      '<div class="booking-step-nav">' +
        '<button type="button" class="btn btn-secondary" id="complete-cancel-btn">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="complete-save-btn">Save &amp; Mark Completed</button>' +
      '</div>';

    var modal = document.getElementById('admin-complete-modal');
    modal.hidden = false;
    box.querySelector('.modal-close').addEventListener('click', function () { modal.hidden = true; });
    document.getElementById('complete-cancel-btn').addEventListener('click', function () { modal.hidden = true; });

    var priceInput = document.getElementById('complete-final-price');
    var tipInput = document.getElementById('complete-tip');
    var previewEl = document.getElementById('complete-total-preview');
    function updatePreview() {
      var total = (parseFloat(priceInput.value) || 0) + (parseFloat(tipInput.value) || 0);
      previewEl.textContent = 'Total Collected: ' + SS.formatMoney(total);
    }
    priceInput.addEventListener('input', updatePreview);
    tipInput.addEventListener('input', updatePreview);
    updatePreview();

    document.getElementById('complete-save-btn').addEventListener('click', function () {
      var errorEl = document.getElementById('complete-error');
      errorEl.textContent = '';
      var finalPrice = priceInput.value === '' ? null : parseFloat(priceInput.value);
      var tip = tipInput.value === '' ? 0 : parseFloat(tipInput.value);
      if (finalPrice !== null && (isNaN(finalPrice) || finalPrice < 0)) { errorEl.textContent = 'Enter a valid final price.'; return; }
      if (isNaN(tip) || tip < 0) { errorEl.textContent = 'Enter a valid tip amount (0 is fine).'; return; }

      var patch = {
        status: 'completed',
        final_price: finalPrice,
        tip_amount: tip,
        payment_method: document.getElementById('complete-payment-method').value || null,
        payment_date: document.getElementById('complete-payment-date').value || null
      };
      modal.hidden = true;
      updateBooking(b.id, patch).then(function () { openDetail(b.id); });
    });
  }
  document.getElementById('admin-complete-modal').addEventListener('click', function (e) { if (e.target === this) { this.hidden = true; } });

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
      (b.final_price !== null && b.final_price !== undefined ? paymentSummaryHTML(b) : '') +
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
        if (status === 'completed') {
          openCompleteJobModal(b);
        } else if (status === 'declined' || status === 'cancelled') {
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
  /* Revenue                                                                  */
  /* ---------------------------------------------------------------------- */
  // Revenue is always computed live from `bookings` (status === 'completed'),
  // never cached — so changing a booking's status instantly and correctly
  // changes every number on this page with no extra bookkeeping.
  var revenueChartYear = new Date().getFullYear();
  var revenueFilterRange = 'this-month';
  var revenueCustomStart = null;
  var revenueCustomEnd = null;
  var expandedRevenueMonth = null;
  var currentMonthlyStats = [];

  function sum(arr, fn) { return arr.reduce(function (s, x) { return s + fn(x); }, 0); }
  function completedBookings() { return bookings.filter(function (b) { return b.status === 'completed'; }); }
  // Falls back to requested_date (or the row's created date) for completed
  // jobs recorded before payment_date existed, or left blank.
  function revenueDateStr(b) { return b.payment_date || b.requested_date || (b.created_at ? b.created_at.slice(0, 10) : '0000-00-00'); }
  // Missing tip/final price never breaks a total — treated as $0 / the
  // original quoted price, exactly like the database's own defaults.
  function serviceRevenueOf(b) { var v = (b.final_price !== null && b.final_price !== undefined) ? b.final_price : b.price; return Number(v) || 0; }
  function tipOf(b) { return Number(b.tip_amount) || 0; }
  function totalOf(b) { return serviceRevenueOf(b) + tipOf(b); }

  function firstOfMonth(y, m) { return y + '-' + pad2(m + 1) + '-01'; }
  function lastOfMonth(y, m) { var d = new Date(y, m + 1, 0); return y + '-' + pad2(m + 1) + '-' + pad2(d.getDate()); }

  function computeRangeBounds(key) {
    var now = new Date(); var y = now.getFullYear(); var m = now.getMonth();
    if (key === 'this-month') { return { start: firstOfMonth(y, m), end: lastOfMonth(y, m) }; }
    if (key === 'last-month') { var d1 = new Date(y, m - 1, 1); return { start: firstOfMonth(d1.getFullYear(), d1.getMonth()), end: lastOfMonth(d1.getFullYear(), d1.getMonth()) }; }
    if (key === 'last-3-months') { var d3 = new Date(y, m - 2, 1); return { start: firstOfMonth(d3.getFullYear(), d3.getMonth()), end: lastOfMonth(y, m) }; }
    if (key === 'last-6-months') { var d6 = new Date(y, m - 5, 1); return { start: firstOfMonth(d6.getFullYear(), d6.getMonth()), end: lastOfMonth(y, m) }; }
    if (key === 'this-year') { return { start: y + '-01-01', end: y + '-12-31' }; }
    if (key === 'last-year') { return { start: (y - 1) + '-01-01', end: (y - 1) + '-12-31' }; }
    return null;
  }

  function getFilteredCompletedBookings() {
    var range = revenueFilterRange === 'custom'
      ? (revenueCustomStart && revenueCustomEnd ? { start: revenueCustomStart, end: revenueCustomEnd } : null)
      : computeRangeBounds(revenueFilterRange);
    if (!range) { return []; }
    return completedBookings().filter(function (b) { var d = revenueDateStr(b); return d >= range.start && d <= range.end; });
  }

  function computeMonthlyStats(year) {
    var completed = completedBookings();
    var months = [];
    for (var m = 0; m < 12; m++) {
      var start = firstOfMonth(year, m), end = lastOfMonth(year, m);
      var jobs = completed.filter(function (b) { var d = revenueDateStr(b); return d >= start && d <= end; });
      var service = sum(jobs, serviceRevenueOf);
      var tips = sum(jobs, tipOf);
      months.push({
        month: m, label: MONTH_NAMES[m], jobs: jobs, jobsCount: jobs.length,
        service: service, tips: tips, total: service + tips,
        avgJob: jobs.length ? service / jobs.length : 0,
        avgTip: jobs.length ? tips / jobs.length : 0
      });
    }
    return months;
  }

  function niceMax(value) {
    if (value <= 0) { return 100; }
    var magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    var residual = value / magnitude;
    var step = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
    return step * magnitude;
  }

  /* ---- Summary cards (fixed: This Month / This Year — not filter-scoped) - */
  function renderRevenueSummary() {
    var now = new Date(); var y = now.getFullYear(); var m = now.getMonth();
    var monthBounds = { start: firstOfMonth(y, m), end: lastOfMonth(y, m) };
    var yearBounds = { start: y + '-01-01', end: y + '-12-31' };
    var all = completedBookings();
    var monthJobs = all.filter(function (b) { var d = revenueDateStr(b); return d >= monthBounds.start && d <= monthBounds.end; });
    var yearJobs = all.filter(function (b) { var d = revenueDateStr(b); return d >= yearBounds.start && d <= yearBounds.end; });

    var monthService = sum(monthJobs, serviceRevenueOf), monthTips = sum(monthJobs, tipOf);
    var yearService = sum(yearJobs, serviceRevenueOf), yearTips = sum(yearJobs, tipOf);
    var avgJob = all.length ? sum(all, serviceRevenueOf) / all.length : 0;
    var avgTip = all.length ? sum(all, tipOf) / all.length : 0;

    var cards = [
      { icon: '🧽', value: SS.formatMoney(monthService) || '$0', label: 'Revenue This Month' },
      { icon: '🤝', value: SS.formatMoney(monthTips) || '$0', label: 'Tips This Month' },
      { icon: '💵', value: SS.formatMoney(monthService + monthTips) || '$0', label: 'Total This Month', highlight: true },
      { icon: '📆', value: SS.formatMoney(yearService) || '$0', label: 'Revenue This Year' },
      { icon: '🎁', value: SS.formatMoney(yearTips) || '$0', label: 'Tips This Year' },
      { icon: '🏆', value: SS.formatMoney(yearService + yearTips) || '$0', label: 'Total This Year', highlight: true },
      { icon: '📊', value: SS.formatMoney(avgJob) || '$0', label: 'Avg. Revenue / Job' },
      { icon: '✨', value: SS.formatMoney(avgTip) || '$0', label: 'Avg. Tip / Job' }
    ];
    document.getElementById('admin-revenue-summary-grid').innerHTML = cards.map(function (c) {
      return '<div class="admin-summary-card' + (c.highlight ? ' is-highlight' : '') + '">' +
        '<div class="admin-summary-card-icon">' + c.icon + '</div>' +
        '<div class="admin-summary-card-value">' + c.value + '</div>' +
        '<div class="admin-summary-card-label">' + c.label + '</div>' +
      '</div>';
    }).join('');
  }

  /* ---- Monthly stacked-bar chart ------------------------------------------ */
  var REV_CHART_W = 700, REV_CHART_H = 240, REV_CHART_TOP = 16, REV_CHART_BOTTOM = 28;

  function renderRevenueChart(year, monthly) {
    var wrap = document.getElementById('admin-revenue-chart-wrap');
    var maxTotal = Math.max.apply(null, monthly.map(function (mo) { return mo.total; }).concat([0]));
    var yMax = niceMax(maxTotal);
    var plotH = REV_CHART_H - REV_CHART_TOP - REV_CHART_BOTTOM;
    var baseline = REV_CHART_TOP + plotH;
    var slotW = REV_CHART_W / 12;
    var barW = slotW * 0.46;

    function yFor(v) { return baseline - (v / yMax) * plotH; }

    var gridLines = '';
    for (var s = 0; s <= 4; s++) {
      var v = (yMax / 4) * s;
      var gy = yFor(v);
      gridLines += '<line class="admin-revenue-chart-grid" x1="0" y1="' + gy + '" x2="' + REV_CHART_W + '" y2="' + gy + '"></line>';
      gridLines += '<text class="admin-revenue-chart-axis-label" x="2" y="' + (gy - 4) + '">' + SS.formatMoney(Math.round(v)) + '</text>';
    }

    var marks = '';
    monthly.forEach(function (mo, i) {
      var x = i * slotW + (slotW - barW) / 2;
      var gap = (mo.service > 0 && mo.tips > 0) ? 2 : 0;
      var serviceH = (mo.service / yMax) * plotH;
      var tipH = (mo.tips / yMax) * plotH;
      var serviceY = baseline - serviceH;
      var tipY = serviceY - gap - tipH;

      if (mo.service > 0) {
        var serviceIsTop = mo.tips <= 0;
        marks += '<rect class="admin-revenue-bar-seg" data-month="' + i + '" x="' + x + '" y="' + serviceY + '" width="' + barW + '" height="' + Math.max(serviceH, 1) + '" fill="var(--rev-service)"' + (serviceIsTop ? ' rx="4" ry="4"' : '') + '></rect>';
      }
      if (mo.tips > 0) {
        marks += '<rect class="admin-revenue-bar-seg" data-month="' + i + '" x="' + x + '" y="' + tipY + '" width="' + barW + '" height="' + Math.max(tipH, 1) + '" fill="var(--rev-tip)" rx="4" ry="4"></rect>';
      }
      marks += '<rect class="admin-revenue-bar-hit" data-month="' + i + '" x="' + (i * slotW) + '" y="' + REV_CHART_TOP + '" width="' + slotW + '" height="' + plotH + '"></rect>';
      marks += '<text class="admin-revenue-chart-axis-label" x="' + (i * slotW + slotW / 2) + '" y="' + (REV_CHART_H - 8) + '" text-anchor="middle">' + mo.label.slice(0, 3) + '</text>';
    });

    var legend = '<div class="admin-revenue-chart-legend">' +
      '<span class="admin-revenue-chart-legend-item"><span class="admin-revenue-chart-legend-swatch" style="background:var(--rev-service)"></span>Service Revenue</span>' +
      '<span class="admin-revenue-chart-legend-item"><span class="admin-revenue-chart-legend-swatch" style="background:var(--rev-tip)"></span>Tips</span>' +
    '</div>';

    var svg = '<svg viewBox="0 0 ' + REV_CHART_W + ' ' + REV_CHART_H + '" style="width:100%; height:auto; display:block;" role="img" aria-label="Monthly revenue chart for ' + year + '">' + gridLines + marks + '</svg>';

    wrap.innerHTML = legend + svg + '<div class="admin-revenue-tooltip" id="admin-revenue-tooltip"></div>';

    var tooltip = document.getElementById('admin-revenue-tooltip');
    wrap.querySelectorAll('.admin-revenue-bar-hit').forEach(function (hit) {
      var idx = Number(hit.getAttribute('data-month'));
      function show() {
        wrap.querySelectorAll('.admin-revenue-bar-seg[data-month="' + idx + '"]').forEach(function (seg) { seg.classList.add('is-hovered'); });
        var mo = monthly[idx];
        tooltip.innerHTML =
          '<div class="rt-title">' + escapeHtml(mo.label) + ' ' + year + '</div>' +
          '<div class="rt-row"><span>Service</span><span class="rt-val">' + SS.formatMoney(mo.service) + '</span></div>' +
          '<div class="rt-row"><span>Tips</span><span class="rt-val">' + SS.formatMoney(mo.tips) + '</span></div>' +
          '<div class="rt-row"><span>Total</span><span class="rt-val">' + SS.formatMoney(mo.total) + '</span></div>' +
          '<div class="rt-row"><span>Jobs</span><span class="rt-val">' + mo.jobsCount + '</span></div>';
        var hitBox = hit.getBoundingClientRect(), wrapBox = wrap.getBoundingClientRect();
        tooltip.style.left = (hitBox.left - wrapBox.left + hitBox.width / 2) + 'px';
        tooltip.style.top = (hitBox.top - wrapBox.top) + 'px';
        tooltip.classList.add('is-visible');
      }
      function hide() {
        wrap.querySelectorAll('.admin-revenue-bar-seg[data-month="' + idx + '"]').forEach(function (seg) { seg.classList.remove('is-hovered'); });
        tooltip.classList.remove('is-visible');
      }
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('mouseleave', hide);
      hit.addEventListener('focus', show);
      hit.addEventListener('blur', hide);
      hit.addEventListener('touchstart', function (e) { e.preventDefault(); show(); }, { passive: false });
      hit.addEventListener('click', function () { toggleMonthExpand(idx); });
    });
  }

  /* ---- Monthly breakdown (click a month to see its jobs) ------------------ */
  function renderMonthlyBreakdownList() {
    var el = document.getElementById('admin-revenue-monthly-list');
    el.innerHTML = currentMonthlyStats.map(function (mo, i) {
      return '<div class="admin-revenue-month-row' + (expandedRevenueMonth === i ? ' is-expanded' : '') + '" data-month="' + i + '">' +
        '<span class="rm-name">' + mo.label + '</span>' +
        '<div class="rm-stat"><span class="k">Jobs</span><span class="v">' + mo.jobsCount + '</span></div>' +
        '<div class="rm-stat"><span class="k">Service</span><span class="v">' + SS.formatMoney(mo.service) + '</span></div>' +
        '<div class="rm-stat"><span class="k">Tips</span><span class="v">' + SS.formatMoney(mo.tips) + '</span></div>' +
        '<div class="rm-stat"><span class="k">Total</span><span class="v" style="color:var(--a-accent-bright);">' + SS.formatMoney(mo.total) + '</span></div>' +
        '<div class="rm-stat"><span class="k">Avg Job / Tip</span><span class="v">' + SS.formatMoney(mo.avgJob) + ' / ' + SS.formatMoney(mo.avgTip) + '</span></div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.admin-revenue-month-row').forEach(function (row) {
      row.addEventListener('click', function () { toggleMonthExpand(Number(row.getAttribute('data-month'))); });
    });
    renderMonthJobsPanel();
  }

  function toggleMonthExpand(idx) {
    expandedRevenueMonth = expandedRevenueMonth === idx ? null : idx;
    renderMonthlyBreakdownList();
  }

  function paymentRowHTML(b) {
    return '<div class="admin-row" data-id="' + escapeHtml(b.id) + '">' +
      '<div class="admin-row-main">' +
        '<div class="admin-row-name">' + escapeHtml(b.customer_name) + '</div>' +
        '<div class="admin-row-meta">' + escapeHtml(b.service) + ' · ' + fmtDate(revenueDateStr(b)) + (b.payment_method ? ' · ' + SS.PAYMENT_METHOD_LABELS[b.payment_method] : '') + '</div>' +
      '</div>' +
      '<span class="admin-row-price">' + SS.formatMoney(totalOf(b)) + '</span>' +
    '</div>';
  }

  function renderMonthJobsPanel() {
    var el = document.getElementById('admin-revenue-month-jobs');
    if (expandedRevenueMonth === null) { el.innerHTML = ''; return; }
    var mo = currentMonthlyStats[expandedRevenueMonth];
    if (!mo.jobs.length) { el.innerHTML = '<p class="admin-booking-card-empty">No completed jobs in ' + mo.label + ' ' + revenueChartYear + '.</p>'; return; }
    el.innerHTML = '<div class="admin-revenue-month-jobs-panel"><div class="admin-row-list">' + mo.jobs.map(paymentRowHTML).join('') + '</div></div>';
    bindRowClicks(el);
  }

  /* ---- Revenue by service / vehicle ---------------------------------------- */
  function computeGroupedBreakdown(jobs, keyFn, labelFn) {
    var groups = {};
    jobs.forEach(function (b) {
      var key = keyFn(b) || 'other';
      if (!groups[key]) { groups[key] = { label: labelFn(b), jobs: [] }; }
      groups[key].jobs.push(b);
    });
    var list = Object.keys(groups).map(function (k) {
      var g = groups[k], service = sum(g.jobs, serviceRevenueOf), tips = sum(g.jobs, tipOf);
      return { label: g.label, count: g.jobs.length, service: service, tips: tips, total: service + tips };
    });
    list.sort(function (a, c) { return c.total - a.total; });
    return list;
  }

  function renderBreakdownList(elId, list, grandTotal) {
    var el = document.getElementById(elId);
    if (!list.length) { el.innerHTML = '<p class="admin-booking-card-empty">No completed jobs in this range.</p>'; return; }
    el.innerHTML = list.map(function (g) {
      var pct = grandTotal > 0 ? Math.round((g.total / grandTotal) * 100) : 0;
      return '<div class="admin-revenue-breakdown-row">' +
        '<div class="admin-revenue-breakdown-top"><span class="rb-name">' + escapeHtml(g.label) + '</span><span class="rb-pct">' + pct + '% of revenue</span></div>' +
        '<div class="admin-revenue-breakdown-bar-track"><div class="admin-revenue-breakdown-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="admin-revenue-breakdown-stats">' +
          '<span>' + g.count + ' job(s)</span>' +
          '<span>Revenue: <strong>' + SS.formatMoney(g.service) + '</strong></span>' +
          '<span>Tips: <strong>' + SS.formatMoney(g.tips) + '</strong></span>' +
          '<span>Total: <strong>' + SS.formatMoney(g.total) + '</strong></span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderServiceBreakdown(jobs) {
    var list = computeGroupedBreakdown(jobs,
      function (b) { return b.service_key || b.service; },
      function (b) { return (b.service_key && SS.SERVICES[b.service_key]) ? SS.SERVICES[b.service_key].name : b.service; });
    renderBreakdownList('admin-revenue-service-list', list, sum(jobs, totalOf));
  }

  function renderVehicleBreakdown(jobs) {
    var list = computeGroupedBreakdown(jobs,
      function (b) { return b.vehicle_size || 'other'; },
      function (b) { return SS.VEHICLE_SIZE_LABELS[b.vehicle_size] || 'Other'; });
    renderBreakdownList('admin-revenue-vehicle-list', list, sum(jobs, totalOf));
  }

  /* ---- Recent payments ------------------------------------------------------ */
  function paymentCardHTML(b) {
    return '<article class="admin-booking-card" data-id="' + escapeHtml(b.id) + '">' +
      '<div class="admin-card-top">' +
        '<div><h3>' + escapeHtml(b.customer_name) + '</h3><p class="admin-card-sub">' + escapeHtml(b.service) + '</p></div>' +
        '<span class="admin-row-price">' + SS.formatMoney(totalOf(b)) + '</span>' +
      '</div>' +
      '<div class="admin-card-grid">' +
        '<div><span class="k">Vehicle</span>' + escapeHtml(b.vehicle_type) + '</div>' +
        '<div><span class="k">Date</span>' + fmtDate(revenueDateStr(b)) + '</div>' +
        '<div><span class="k">Service Price</span>' + SS.formatMoney(serviceRevenueOf(b)) + '</div>' +
        '<div><span class="k">Tip</span>' + SS.formatMoney(tipOf(b)) + '</div>' +
        '<div><span class="k">Total</span>' + SS.formatMoney(totalOf(b)) + '</div>' +
        '<div><span class="k">Payment Method</span>' + (b.payment_method ? escapeHtml(SS.PAYMENT_METHOD_LABELS[b.payment_method]) : '—') + '</div>' +
      '</div>' +
    '</article>';
  }

  function renderRecentPayments(filtered) {
    var el = document.getElementById('admin-revenue-recent-list');
    var sorted = filtered.slice().sort(function (a, c) { return revenueDateStr(c).localeCompare(revenueDateStr(a)); }).slice(0, 12);
    if (!sorted.length) { el.innerHTML = '<p class="admin-booking-card-empty">No completed payments in this range.</p>'; return; }
    el.innerHTML = sorted.map(paymentCardHTML).join('');
    bindRowClicks(el);
  }

  /* ---- CSV export ------------------------------------------------------------ */
  function csvEscape(v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (/[",\n]/.test(s)) { s = '"' + s.replace(/"/g, '""') + '"'; }
    return s;
  }

  function exportRevenueCSV() {
    var jobs = getFilteredCompletedBookings().slice().sort(function (a, c) { return revenueDateStr(a).localeCompare(revenueDateStr(c)); });
    if (!jobs.length) { alert('No completed jobs in the selected range to export.'); return; }
    var header = ['Date', 'Customer', 'Booking ID', 'Service', 'Vehicle', 'Service Revenue', 'Tip', 'Total Collected', 'Payment Method'];
    var rows = jobs.map(function (b) {
      return [
        revenueDateStr(b), b.customer_name, b.id, b.service, b.vehicle_type,
        serviceRevenueOf(b).toFixed(2), tipOf(b).toFixed(2), totalOf(b).toFixed(2),
        b.payment_method ? SS.PAYMENT_METHOD_LABELS[b.payment_method] : ''
      ].map(csvEscape).join(',');
    });
    var csv = header.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'southern-suds-revenue-' + revenueFilterRange + '-' + todayStr() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---- Main dispatcher + filter/year wiring ---------------------------------- */
  function renderRevenue() {
    renderRevenueSummary();
    currentMonthlyStats = computeMonthlyStats(revenueChartYear);
    var yearLabelEl = document.getElementById('revenue-year-label');
    if (yearLabelEl) { yearLabelEl.textContent = String(revenueChartYear); }
    renderRevenueChart(revenueChartYear, currentMonthlyStats);
    renderMonthlyBreakdownList();
    var filtered = getFilteredCompletedBookings();
    renderServiceBreakdown(filtered);
    renderVehicleBreakdown(filtered);
    renderRecentPayments(filtered);
  }

  var revFilterTabs = Array.prototype.slice.call(document.querySelectorAll('#admin-revenue-filter-tabs .admin-filter-tab'));
  revFilterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      revFilterTabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      revenueFilterRange = tab.getAttribute('data-range');
      var customRangeEl = document.getElementById('admin-revenue-custom-range');
      customRangeEl.hidden = revenueFilterRange !== 'custom';
      if (revenueFilterRange !== 'custom') { renderRevenue(); }
    });
  });
  var revRangeApplyBtn = document.getElementById('revenue-range-apply');
  if (revRangeApplyBtn) {
    revRangeApplyBtn.addEventListener('click', function () {
      revenueCustomStart = document.getElementById('revenue-range-start').value;
      revenueCustomEnd = document.getElementById('revenue-range-end').value;
      if (revenueCustomStart && revenueCustomEnd) { renderRevenue(); }
    });
  }
  var revYearPrev = document.getElementById('revenue-year-prev');
  var revYearNext = document.getElementById('revenue-year-next');
  if (revYearPrev) { revYearPrev.addEventListener('click', function () { revenueChartYear--; renderRevenue(); }); }
  if (revYearNext) { revYearNext.addEventListener('click', function () { revenueChartYear++; renderRevenue(); }); }
  var revExportBtn = document.getElementById('admin-revenue-export-btn');
  if (revExportBtn) { revExportBtn.addEventListener('click', exportRevenueCSV); }

  /* ---------------------------------------------------------------------- */
  /* Push notifications (real mobile push — Web Push API, VAPID)            */
  /* ---------------------------------------------------------------------- */
  var pushStatusBadge = document.getElementById('push-status-badge');
  var pushStatusHint = document.getElementById('push-status-hint');
  var pushEnableBtn = document.getElementById('push-enable-btn');
  var pushDisableBtn = document.getElementById('push-disable-btn');
  var pushTestBtn = document.getElementById('push-test-btn');
  var pushErrorEl = document.getElementById('push-error');
  var pushSuccessEl = document.getElementById('push-success');
  var pushDeviceListEl = document.getElementById('push-device-list');
  var currentAdminUserId = null;
  var swRegistration = null;

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
  }

  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function friendlyDeviceLabel() {
    var ua = navigator.userAgent;
    var platform = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
    var browser = /Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
    return platform + ' — ' + browser;
  }

  function registerServiceWorker() {
    if (!pushSupported()) { return Promise.resolve(null); }
    return navigator.serviceWorker.register('admin-sw.js').then(function (reg) {
      swRegistration = reg;
      return navigator.serviceWorker.ready;
    }).catch(function (err) {
      console.error('Service worker registration failed:', err);
      return null;
    });
  }

  function setPushMessages(errorMsg, successMsg) {
    if (pushErrorEl) { pushErrorEl.textContent = errorMsg || ''; }
    if (pushSuccessEl) { pushSuccessEl.textContent = successMsg || ''; }
  }

  function renderPushStatus(state, existingSubscription) {
    // state: 'not-supported' | 'demo' | 'denied' | 'enabled' | 'disabled'
    var badgeClass = 'status-badge--cancelled';
    var label = 'Disabled';
    pushEnableBtn.hidden = true;
    pushDisableBtn.hidden = true;
    pushTestBtn.hidden = true;

    if (state === 'not-supported') {
      label = 'Not Supported'; badgeClass = 'status-badge--cancelled';
      pushStatusHint.textContent = 'This browser doesn’t support push notifications. Try Chrome, Edge, or Firefox, or Safari on iOS 16.4+ after adding this dashboard to your Home Screen.';
    } else if (state === 'demo') {
      label = 'Not Supported'; badgeClass = 'status-badge--cancelled';
      pushStatusHint.textContent = 'Connect a real Supabase project (see BOOKING-V2-SETUP.md) to enable real push notifications — demo mode has no backend to deliver them.';
    } else if (state === 'denied') {
      label = 'Permission Denied'; badgeClass = 'status-badge--declined';
      pushStatusHint.textContent = 'Notifications are blocked for this site in your browser settings. Allow notifications for this site, then reload this page.';
    } else if (state === 'enabled') {
      label = 'Enabled'; badgeClass = 'status-badge--confirmed';
      pushStatusHint.textContent = 'You’ll get a push notification on this device when a customer submits a new booking.';
      pushDisableBtn.hidden = false;
      pushTestBtn.hidden = false;
    } else {
      label = 'Disabled'; badgeClass = 'status-badge--cancelled';
      pushStatusHint.textContent = 'Turn this on to get a real push notification — like a text or app alert — the moment a customer books.';
      pushEnableBtn.hidden = false;
    }

    pushStatusBadge.className = 'status-badge ' + badgeClass;
    pushStatusBadge.textContent = label;
  }

  function refreshPushStatus() {
    if (SS.DEMO_MODE) { renderPushStatus('demo'); return Promise.resolve(); }
    if (!pushSupported()) { renderPushStatus('not-supported'); return Promise.resolve(); }
    if (Notification.permission === 'denied') { renderPushStatus('denied'); return Promise.resolve(); }

    return registerServiceWorker().then(function (reg) {
      if (!reg) { renderPushStatus('not-supported'); return; }
      return reg.pushManager.getSubscription().then(function (sub) {
        renderPushStatus(sub ? 'enabled' : 'disabled', sub);
      });
    });
  }

  function enablePushNotifications() {
    setPushMessages('', '');
    if (!pushSupported()) { setPushMessages('Push notifications are not supported in this browser.'); return; }

    registerServiceWorker().then(function (reg) {
      if (!reg) { setPushMessages('Could not set up the service worker needed for notifications.'); return; }

      Notification.requestPermission().then(function (permission) {
        if (permission !== 'granted') {
          refreshPushStatus();
          setPushMessages(permission === 'denied' ? 'Notification permission was denied.' : 'Notification permission was not granted.');
          return;
        }

        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY)
        }).then(function (subscription) {
          var json = subscription.toJSON();
          var client = SS.getClient();
          return client.from('push_subscriptions').insert([{
            user_id: currentAdminUserId,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth_key: json.keys.auth,
            device_label: friendlyDeviceLabel(),
            user_agent: navigator.userAgent
          }]).then(function (res) {
            if (res.error) {
              // Endpoint already registered (e.g. re-enabling) — treat as success.
              if (res.error.code === '23505') { setPushMessages('', 'Notifications enabled on this device.'); }
              else { setPushMessages('Saved the subscription locally, but could not store it: ' + res.error.message); }
            } else {
              setPushMessages('', 'Notifications enabled on this device.');
            }
            refreshPushStatus();
            renderDeviceList();
          });
        }).catch(function (err) {
          console.error('Push subscribe failed:', err);
          setPushMessages('Could not enable notifications: ' + (err && err.message ? err.message : err));
        });
      });
    });
  }

  function disablePushNotifications() {
    setPushMessages('', '');
    if (!swRegistration) { refreshPushStatus(); return; }
    swRegistration.pushManager.getSubscription().then(function (sub) {
      if (!sub) { refreshPushStatus(); return; }
      var endpoint = sub.endpoint;
      sub.unsubscribe().finally(function () {
        var client = SS.getClient();
        client.from('push_subscriptions').delete().eq('endpoint', endpoint).then(function () {
          setPushMessages('', 'Notifications disabled on this device.');
          refreshPushStatus();
          renderDeviceList();
        });
      });
    });
  }

  function sendTestPushNotification() {
    setPushMessages('', '');
    if (pushTestBtn) { pushTestBtn.disabled = true; pushTestBtn.textContent = 'Sending…'; }
    var client = SS.getClient();
    client.functions.invoke('send-push-notification', { body: { test: true } }).then(function (res) {
      if (pushTestBtn) { pushTestBtn.disabled = false; pushTestBtn.textContent = 'Send Test Notification'; }
      var data = res.data;
      if (res.error || !data || data.ok === false) {
        setPushMessages((data && data.error) || (res.error && res.error.message) || 'Could not send test notification.');
        return;
      }
      setPushMessages('', 'Test notification sent to ' + data.sent + ' device(s) — check this device now.');
    }).catch(function (err) {
      if (pushTestBtn) { pushTestBtn.disabled = false; pushTestBtn.textContent = 'Send Test Notification'; }
      setPushMessages('Could not send test notification: ' + (err && err.message ? err.message : err));
    });
  }

  function renderDeviceList() {
    if (!pushDeviceListEl) { return; }
    if (SS.DEMO_MODE) { pushDeviceListEl.innerHTML = '<p class="admin-booking-card-empty">Not available in demo mode.</p>'; return; }
    var client = SS.getClient();
    client.from('push_subscriptions').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { pushDeviceListEl.innerHTML = ''; return; }
      var rows = res.data || [];
      if (!rows.length) { pushDeviceListEl.innerHTML = '<p class="admin-booking-card-empty">No devices registered yet.</p>'; return; }
      pushDeviceListEl.innerHTML = rows.map(function (r) {
        return '<div class="admin-row" data-endpoint="' + escapeHtml(r.endpoint) + '" style="cursor:default;">' +
          '<div class="admin-row-main">' +
            '<div class="admin-row-name">' + escapeHtml(r.device_label || 'Unknown device') + '</div>' +
            '<div class="admin-row-meta">Registered ' + fmtDateTime(r.created_at) + '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-muted admin-push-remove-btn" data-id="' + escapeHtml(r.id) + '">Remove</button>' +
        '</div>';
      }).join('');
      pushDeviceListEl.querySelectorAll('.admin-push-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-id');
          confirmAction('Remove this device from push notifications?', function () {
            SS.getClient().from('push_subscriptions').delete().eq('id', id).then(function () {
              renderDeviceList();
              refreshPushStatus();
            });
          });
        });
      });
    });
  }

  if (pushEnableBtn) { pushEnableBtn.addEventListener('click', enablePushNotifications); }
  if (pushDisableBtn) { pushDisableBtn.addEventListener('click', disablePushNotifications); }
  if (pushTestBtn) { pushTestBtn.addEventListener('click', sendTestPushNotification); }

  /* ---------------------------------------------------------------------- */
  /* Deep link — a tapped push notification opens /admin.html?booking=ID    */
  /* ---------------------------------------------------------------------- */
  var pendingDeepLinkBookingId = new URLSearchParams(window.location.search).get('booking');

  function consumeDeepLink() {
    if (!pendingDeepLinkBookingId) { return; }
    var id = pendingDeepLinkBookingId;
    pendingDeepLinkBookingId = null;
    switchView('bookings');
    if (findBooking(id)) {
      openDetail(id);
    } else {
      // Booking not in the already-loaded list yet (e.g. very first load) —
      // give loadBookings() a moment then try again once.
      setTimeout(function () { if (findBooking(id)) { openDetail(id); } }, 400);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Auth                                                                    */
  /* ---------------------------------------------------------------------- */
  function showDashboard(email, userId) {
    loginBox.hidden = true;
    shellEl.hidden = false;
    currentAdminUserId = userId || null;
    var settingsEmail = document.getElementById('admin-settings-email');
    if (settingsEmail && email) { settingsEmail.textContent = email; }
    refreshPushStatus();
    renderDeviceList();
    loadBookings().then(consumeDeepLink);
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
        if (res.data && res.data.session) { showDashboard(res.data.session.user.email, res.data.session.user.id); } else { showLogin(); }
      });

      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (loginError) { loginError.textContent = ''; }
        var email = document.getElementById('admin-email').value.trim();
        var password = document.getElementById('admin-password').value;
        client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
          if (res.error) { if (loginError) { loginError.textContent = res.error.message; } return; }
          showDashboard(email, res.data.user.id);
        });
      });

      logoutBtn.addEventListener('click', function () {
        client.auth.signOut().then(function () { showLogin(); });
      });
    }
  }
})();
