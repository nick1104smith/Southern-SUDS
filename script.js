/* ==========================================================================
   SOUTHERN SUDS MOBILE DETAILING — SITE SCRIPT
   Vanilla JS only. Organized into small, independent feature modules that
   each check for their own DOM elements before running.
   ========================================================================== */

/* Booking form logic now lives in booking-shared.js / booking-new.js,
   talking to Supabase instead of the old Google Apps Script backend (see
   BOOKING-V2-SETUP.md). The old Apps Script backend files are still in
   google-apps-script/ and respond.html, untouched, in case they're ever
   needed again — just no longer wired into this page. */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Footer year                                                        */
  /* ------------------------------------------------------------------ */
  var yearEl = document.getElementById('footer-year');
  if (yearEl) { yearEl.textContent = new Date().getFullYear(); }

  /* ------------------------------------------------------------------ */
  /* Sticky header shadow on scroll                                     */
  /* ------------------------------------------------------------------ */
  var header = document.getElementById('site-header');
  function onScrollHeader() {
    if (!header) { return; }
    if (window.scrollY > 12) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  /* ------------------------------------------------------------------ */
  /* Mobile hamburger menu                                              */
  /* ------------------------------------------------------------------ */
  var hamburger = document.getElementById('hamburger');
  var navLinks = document.getElementById('nav-links');

  function closeMenu() {
    if (!hamburger || !navLinks) { return; }
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open menu');
    navLinks.classList.remove('is-open');
  }

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      var isOpen = navLinks.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
      hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMenu(); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mobile "Services" submenu accordion (desktop keeps a plain link —   */
  /* this toggle is hidden entirely outside the mobile menu breakpoint). */
  /* ------------------------------------------------------------------ */
  var navServicesToggle = document.getElementById('nav-services-toggle');
  var navServicesSubmenu = document.getElementById('nav-services-submenu');
  if (navServicesToggle && navServicesSubmenu) {
    navServicesToggle.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = navServicesSubmenu.classList.toggle('is-open');
      navServicesToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Back to top button                                                 */
  /* ------------------------------------------------------------------ */
  var backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', function () {
      backToTop.hidden = window.scrollY < 500;
    }, { passive: true });

    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Floating desktop Book Now button                                   */
  /* ------------------------------------------------------------------ */
  var floatingBookBtn = document.getElementById('floating-book-btn');
  if (floatingBookBtn) {
    window.addEventListener('scroll', function () {
      floatingBookBtn.classList.toggle('is-visible', window.scrollY > 500);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Scroll-reveal animations (respects reduced-motion via CSS)         */
  /* Cards that share a parent grid get a short staggered delay so they */
  /* cascade in rather than popping in all at once.                    */
  /* ------------------------------------------------------------------ */
  var revealEls = document.querySelectorAll('.reveal');

  revealEls.forEach(function (el) {
    var parent = el.parentElement;
    if (!parent) { return; }
    var siblings = Array.prototype.filter.call(parent.children, function (child) {
      return child.classList.contains('reveal');
    });
    var index = siblings.indexOf(el);
    if (index > 0) {
      el.style.setProperty('--reveal-delay', Math.min(index * 70, 350) + 'ms');
    }
  });

  if ('IntersectionObserver' in window && revealEls.length) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ------------------------------------------------------------------ */
  /* FAQ accordion                                                      */
  /* ------------------------------------------------------------------ */
  var accordionTriggers = document.querySelectorAll('.accordion-trigger');
  accordionTriggers.forEach(function (trigger) {
    var panel = trigger.closest('.accordion-item').querySelector('.accordion-panel');
    if (!panel) { return; }

    trigger.addEventListener('click', function () {
      var isOpen = trigger.getAttribute('aria-expanded') === 'true';

      // Close all other panels (single-open accordion)
      accordionTriggers.forEach(function (otherTrigger) {
        if (otherTrigger === trigger) { return; }
        otherTrigger.setAttribute('aria-expanded', 'false');
        var otherPanel = otherTrigger.closest('.accordion-item').querySelector('.accordion-panel');
        if (otherPanel) { otherPanel.style.maxHeight = null; }
      });

      trigger.setAttribute('aria-expanded', String(!isOpen));
      panel.style.maxHeight = isOpen ? null : panel.scrollHeight + 'px';
    });
  });

  /* ------------------------------------------------------------------ */
  /* Odor Treatment level picker — lives on its service card. Updates the */
  /* displayed price and the Book button's data-package so booking-new.js */
  /* (which owns [data-package] click handling now) picks up whichever   */
  /* level is currently selected.                                        */
  /* ------------------------------------------------------------------ */
  var odorLevelSelect = document.getElementById('odor-level-select');
  var odorLevelPrice = document.getElementById('odor-level-price');
  var odorLevelBtn = document.getElementById('odor-level-btn');
  if (odorLevelSelect && odorLevelPrice && odorLevelBtn) {
    odorLevelSelect.addEventListener('change', function () {
      var opt = odorLevelSelect.options[odorLevelSelect.selectedIndex];
      var price = opt.getAttribute('data-price');
      odorLevelPrice.textContent = '$' + price;
      odorLevelBtn.setAttribute('data-package', opt.value);
      odorLevelBtn.textContent = 'Book Odor Treatment — $' + price;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Legal policy modals                                                */
  /* ------------------------------------------------------------------ */
  var modalTriggers = document.querySelectorAll('[data-modal]');
  var lastFocusedEl = null;

  function openModal(modal) {
    if (!modal) { return; }
    lastFocusedEl = document.activeElement;
    modal.hidden = false;
    var closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) { closeBtn.focus(); }
    document.addEventListener('keydown', modalKeydown);
  }

  function closeModal(modal) {
    if (!modal) { return; }
    modal.hidden = true;
    document.removeEventListener('keydown', modalKeydown);
    if (lastFocusedEl) { lastFocusedEl.focus(); }
  }

  function modalKeydown(e) {
    if (e.key === 'Escape') {
      var openModalEl = document.querySelector('.modal-overlay:not([hidden])');
      closeModal(openModalEl);
    }
  }

  modalTriggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var modalId = trigger.getAttribute('data-modal');
      var modal = document.getElementById(modalId);
      openModal(modal);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(function (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { closeModal(modal); }
    });
    var closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { closeModal(modal); });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Smooth scroll for in-page anchor links (fallback for older browsers)*/
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#') { return; }
      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  });

})();
