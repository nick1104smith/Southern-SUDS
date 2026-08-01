/* ==========================================================================
   SOUTHERN SUDS MOBILE DETAILING — SITE SCRIPT
   Vanilla JS only. Organized into small, independent feature modules that
   each check for their own DOM elements before running.
   ========================================================================== */

/* ------------------------------------------------------------------ */
/* Booking backend config — set this after deploying the Google Apps  */
/* Script "public" web app (see BOOKING-SYSTEM-SETUP.md). Exposed on  */
/* window so respond.html can reuse the same URL.                     */
/* ------------------------------------------------------------------ */
window.BOOKING_API_URL = 'https://script.google.com/macros/s/AKfycbwrxujpGQFUg8iBXfYFB9MGMocl13Pr0xCECJS4K2eJKh317mS3pl6qdoLwZ3dDz_pyHA/exec';

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
  /* Package / service buttons — pre-fill booking form and scroll to it */
  /* ------------------------------------------------------------------ */
  var selectedPackageField = document.getElementById('selected-package');
  var vehicleSizeGroup = document.getElementById('vehicle-size-group');
  var vehicleSizeField = document.getElementById('vehicle-size');
  var addonCheckboxes = document.querySelectorAll('.addon-checkbox input[type="checkbox"]');

  function parseMoney(str) {
    if (!str) { return null; }
    var m = String(str).replace(/,/g, '').match(/\$([0-9]+(?:\.[0-9]{1,2})?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function formatMoney(amount) {
    var rounded = Math.round(amount * 100) / 100;
    var hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
    var str = hasCents ? rounded.toFixed(2) : String(Math.round(rounded));
    var parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '$' + parts.join('.');
  }

  function getSelectedAddons() {
    return Array.prototype.filter.call(addonCheckboxes, function (cb) { return cb.checked; })
      .map(function (cb) {
        return { name: cb.value, price: parseFloat(cb.getAttribute('data-price')) || 0 };
      });
  }

  // Builds the summary rows for a service, folding in any checked Add-On
  // Services so the total reflects the base service plus every add-on —
  // not just whichever the customer picked last.
  function buildSummaryRows(serviceName, priceLabel, priceAmount, isEstimate, sizeLabel) {
    var rows = [['Service', serviceName]];
    if (sizeLabel) { rows.push(['Vehicle Size', sizeLabel]); }
    var addons = getSelectedAddons();
    var addonTotal = addons.reduce(function (sum, a) { return sum + a.price; }, 0);

    if (priceLabel) { rows.push(['Price', priceLabel]); }
    addons.forEach(function (a) {
      rows.push(['+ ' + a.name, a.price > 0 ? formatMoney(a.price) : 'FREE']);
    });

    if (priceAmount !== null && priceAmount !== undefined) {
      var total = priceAmount + addonTotal;
      rows.push(['Selected Service Total', (isEstimate ? 'Starting at ' : '') + formatMoney(total)]);
    } else if (priceLabel && addons.length) {
      rows.push(['Selected Service Total', priceLabel + ' + ' + formatMoney(addonTotal) + ' in add-ons (confirmed at booking)']);
    } else if (priceLabel) {
      rows.push(['Selected Service Total', priceLabel]);
    } else if (addons.length) {
      rows.push(['Selected Service Total', formatMoney(addonTotal) + ' in add-ons (base price confirmed at booking)']);
    }
    return rows;
  }

  // Any service priced by two selections (service + vehicle size) instead of
  // one flat option-text price is looked up here rather than parsed from the
  // single-source-of-truth option text used by every other service.
  var tieredPricing = {
    'Interior Detailing - Level 1': {
      label: 'Level 1 — Base Interior Maintenance',
      startingAt: false,
      prices: { compact: 120, 'full-size': 135, larger: 150 }
    },
    'Interior Detailing - Level 2': {
      label: 'Level 2 — Moderate Interior Detail',
      startingAt: false,
      prices: { compact: 175, 'full-size': 200, larger: 225 }
    },
    'Interior Detailing - Level 3': {
      label: 'Level 3 — Extreme Interior Detail',
      startingAt: true,
      prices: { compact: 289, 'full-size': 315, larger: 345 }
    },
    'Southern Standard Refresh': {
      label: 'Southern Standard Refresh',
      startingAt: false,
      prices: { compact: 185, 'full-size': 200, larger: 215 }
    },
    'Full Southern Detail': {
      label: 'Full Southern Detail',
      startingAt: false,
      prices: { compact: 280, 'full-size': 300, larger: 320 }
    },
    'Full Restoration Detail': {
      label: 'Full Restoration Detail',
      startingAt: false,
      prices: { compact: 485, 'full-size': 500, larger: 520 }
    }
  };
  var vehicleSizeLabels = { compact: 'Compact Car', 'full-size': 'Full-Size Car', larger: 'Larger Vehicle / Truck' };

  function setVehicleSizeVisible(visible) {
    if (!vehicleSizeGroup || !vehicleSizeField) { return; }
    vehicleSizeGroup.hidden = !visible;
    if (visible) {
      vehicleSizeField.setAttribute('required', 'required');
    } else {
      vehicleSizeField.removeAttribute('required');
      vehicleSizeField.value = '';
    }
  }

  function updateServiceSummary() {
    var summaryBox = document.getElementById('service-summary-box');
    var summaryList = document.getElementById('service-summary-list');
    if (!summaryBox || !summaryList || !selectedPackageField) { return; }

    var option = selectedPackageField.options[selectedPackageField.selectedIndex];
    if (!option || !option.value) {
      summaryBox.hidden = true;
      summaryList.innerHTML = '';
      setVehicleSizeVisible(false);
      return;
    }

    var tier = tieredPricing[option.value];

    if (tier) {
      setVehicleSizeVisible(true);
      var size = vehicleSizeField ? vehicleSizeField.value : '';
      var rows;
      if (size && tier.prices[size] !== undefined) {
        var exactPrice = (tier.startingAt ? 'Starting at $' : '$') + tier.prices[size];
        rows = buildSummaryRows(tier.label, exactPrice, tier.prices[size], tier.startingAt, vehicleSizeLabels[size]);
      } else {
        rows = [
          ['Service', tier.label],
          ['Price', 'Select vehicle size for exact price']
        ];
      }
      summaryList.innerHTML = rows.map(function (r) {
        return '<li><span>' + r[0] + '</span><span>' + r[1] + '</span></li>';
      }).join('');
      summaryBox.hidden = false;
      return;
    }

    setVehicleSizeVisible(false);

    // Option text is authored as "Service Name — $Price" (or just the name
    // when there's no fixed price, e.g. custom-quote/plan options). Reading
    // it straight from the dropdown keeps this in sync with a single
    // source of truth instead of duplicating prices in JavaScript. Some
    // names (e.g. "Mold Removal — Level 1 — $399") contain an em dash of
    // their own, so the last segment is always the price and everything
    // before it is the name — a plain split(1) would grab "Level 1"
    // instead of "$399".
    var parts = option.textContent.split('—').map(function (s) { return s.trim(); });
    var price = parts.length > 1 ? parts[parts.length - 1] : '';
    var serviceName = parts.length > 1 ? parts.slice(0, -1).join(' — ') : parts[0];

    var rows2 = buildSummaryRows(serviceName, price, parseMoney(price), /starting at/i.test(price));

    summaryList.innerHTML = rows2.map(function (r) {
      return '<li><span>' + r[0] + '</span><span>' + r[1] + '</span></li>';
    }).join('');
    summaryBox.hidden = false;
  }

  function prefillBookingPackage(packageName) {
    if (!selectedPackageField) { return; }

    var matched = false;
    Array.prototype.forEach.call(selectedPackageField.options, function (option) {
      if (option.value === packageName || option.textContent.trim() === packageName.trim()) {
        selectedPackageField.value = option.value;
        matched = true;
      }
    });

    if (!matched) {
      selectedPackageField.value = 'Not Sure';
    }

    selectedPackageField.classList.add('field-flash');
    setTimeout(function () { selectedPackageField.classList.remove('field-flash'); }, 900);

    updateServiceSummary();

    // Package buttons elsewhere on the site declare intent to book a
    // specific service, so jump straight to the step where that selection
    // lives instead of making the customer click through Contact/Vehicle
    // first — they can still go back if they haven't filled those in yet.
    goToStep(3);
  }

  if (selectedPackageField) {
    selectedPackageField.addEventListener('change', updateServiceSummary);
  }
  if (vehicleSizeField) {
    vehicleSizeField.addEventListener('change', updateServiceSummary);
  }
  addonCheckboxes.forEach(function (cb) {
    cb.addEventListener('change', updateServiceSummary);
  });

  // Odor Treatment's level picker lives directly on its service card. The
  // Book button's data-package (read fresh on click by the generic
  // [data-package] handler below) and its displayed price stay in sync
  // with whichever level is currently selected.
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

  document.querySelectorAll('[data-package]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var packageName = btn.getAttribute('data-package');
      prefillBookingPackage(packageName);
      // Links with data-package already navigate via href="#booking";
      // buttons (no href) need a manual scroll.
      if (btn.tagName === 'BUTTON') {
        var bookingSection = document.getElementById('booking');
        if (bookingSection) {
          bookingSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

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
  /* Booking form: multi-step wizard + validation + submit               */
  /* ------------------------------------------------------------------ */
  var bookingForm = document.getElementById('booking-form');
  var bookingSteps = Array.prototype.slice.call(document.querySelectorAll('.booking-step'));
  var bookingStepDots = Array.prototype.slice.call(document.querySelectorAll('.booking-step-dot'));
  var confirmationEl = document.getElementById('form-confirmation');
  var submitErrorEl = document.getElementById('booking-submit-error');
  var submitBtn = document.getElementById('submit-booking');

  function fieldText(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function selectedOptionText(id) {
    var el = document.getElementById(id);
    if (!el || el.selectedIndex < 0) { return ''; }
    return el.options[el.selectedIndex].textContent.trim();
  }

  // The live price preview (updateServiceSummary) already computes the
  // "Selected Service Total" row — read it straight off the DOM instead of
  // recomputing it, so the submitted price can never drift from what the
  // customer saw on screen.
  function getPriceSummaryText() {
    var summaryList = document.getElementById('service-summary-list');
    var lastRow = summaryList ? summaryList.lastElementChild : null;
    if (!lastRow) { return ''; }
    var spans = lastRow.querySelectorAll('span');
    return spans.length > 1 ? spans[1].textContent.trim() : '';
  }

  function buildNotesText() {
    var lines = [];
    if (document.getElementById('contact-method')) { lines.push('Preferred contact: ' + selectedOptionText('contact-method')); }
    if (document.getElementById('vehicle-condition')) { lines.push('Vehicle condition: ' + selectedOptionText('vehicle-condition')); }
    if (document.getElementById('pet-hair')) { lines.push('Pet hair present: ' + selectedOptionText('pet-hair')); }
    if (document.getElementById('stains')) { lines.push('Major stains present: ' + selectedOptionText('stains')); }
    if (document.getElementById('odor')) { lines.push('Odor concerns: ' + selectedOptionText('odor')); }
    var details = fieldText('additional-details');
    if (details) { lines.push('', details); }
    return lines.join('\n');
  }

  function buildBookingPayload() {
    var serviceText = selectedPackageField ? selectedPackageField.options[selectedPackageField.selectedIndex].textContent.trim() : '';
    if (vehicleSizeField && vehicleSizeField.value) {
      serviceText += ' — ' + vehicleSizeLabels[vehicleSizeField.value];
    }

    return {
      customerName: fieldText('full-name'),
      phone: fieldText('phone'),
      email: fieldText('email'),
      vehicleYear: fieldText('vehicle-year'),
      vehicleMake: fieldText('vehicle-make'),
      vehicleModel: fieldText('vehicle-model'),
      vehicleType: selectedOptionText('vehicle-type'),
      service: serviceText,
      addons: getSelectedAddons().map(function (a) { return a.name; }).join(', '),
      price: getPriceSummaryText(),
      requestedDate: fieldText('preferred-date'),
      requestedTimeWindow: document.getElementById('preferred-time') ? document.getElementById('preferred-time').value : '',
      address: fieldText('address'),
      city: selectedOptionText('service-city'),
      notes: buildNotesText()
    };
  }

  function requiredFields(form) {
    return Array.prototype.slice.call(form.querySelectorAll('[required]'));
  }

  // Steps are shown/hidden with the `hidden` attribute rather than being
  // separate pages, so the same required-field validation and submit payload
  // logic keeps working untouched — only which step is visible changes.
  function goToStep(stepNumber) {
    bookingSteps.forEach(function (stepEl) {
      stepEl.hidden = Number(stepEl.getAttribute('data-step')) !== stepNumber;
    });
    bookingStepDots.forEach(function (dot) {
      var dotStep = Number(dot.getAttribute('data-step-dot'));
      dot.classList.toggle('is-active', dotStep === stepNumber);
      dot.classList.toggle('is-complete', dotStep < stepNumber);
    });
    var stepsWrap = document.getElementById('booking-steps');
    if (stepsWrap) { stepsWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function validateStepFields(stepEl) {
    var fields = requiredFields(stepEl);
    var isValid = true;
    var firstInvalid = null;
    fields.forEach(function (field) {
      var fieldValid = validateField(field);
      if (!fieldValid) {
        isValid = false;
        if (!firstInvalid) { firstInvalid = field; }
      }
    });
    return { isValid: isValid, firstInvalid: firstInvalid };
  }

  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var phonePattern = /^[0-9()+\-.\s]{7,20}$/;

  function validateField(field) {
    var errorEl = document.getElementById('err-' + field.id);
    var group = field.closest('.form-group');
    var message = '';

    if (field.type === 'checkbox') {
      if (field.required && !field.checked) {
        message = 'Please check this box to continue.';
      }
    } else if (field.required && !field.value.trim()) {
      message = 'This field is required.';
    } else if (field.type === 'email' && field.value && !emailPattern.test(field.value)) {
      message = 'Please enter a valid email address.';
    } else if (field.type === 'tel' && field.value && !phonePattern.test(field.value)) {
      message = 'Please enter a valid phone number.';
    } else if (field.id === 'vehicle-year' && field.value) {
      var yearNum = parseInt(field.value, 10);
      var currentYear = new Date().getFullYear();
      if (isNaN(yearNum) || yearNum < 1970 || yearNum > currentYear + 1) {
        message = 'Please enter a valid vehicle year.';
      }
    }

    if (errorEl) { errorEl.textContent = message; }
    if (group) { group.classList.toggle('has-error', Boolean(message)); }

    return message === '';
  }

  if (bookingForm) {
    requiredFields(bookingForm).forEach(function (field) {
      field.addEventListener('input', function () { validateField(field); });
      field.addEventListener('change', function () { validateField(field); });
      field.addEventListener('blur', function () { validateField(field); });
    });

    document.querySelectorAll('.booking-next-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var stepEl = btn.closest('.booking-step');
        if (!stepEl) { return; }
        var result = validateStepFields(stepEl);
        if (!result.isValid) {
          if (result.firstInvalid) {
            result.firstInvalid.focus();
            result.firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        goToStep(Number(btn.getAttribute('data-step-next')));
      });
    });

    document.querySelectorAll('.booking-back-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        goToStep(Number(btn.getAttribute('data-step-back')));
      });
    });

    goToStep(1);

    bookingForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var fields = requiredFields(bookingForm);
      var isValid = true;
      var firstInvalid = null;

      fields.forEach(function (field) {
        var fieldValid = validateField(field);
        if (!fieldValid) {
          isValid = false;
          if (!firstInvalid) { firstInvalid = field; }
        }
      });

      if (!isValid) {
        if (firstInvalid) {
          var invalidStepEl = firstInvalid.closest('.booking-step');
          if (invalidStepEl) { goToStep(Number(invalidStepEl.getAttribute('data-step'))); }
          firstInvalid.focus();
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      if (submitErrorEl) { submitErrorEl.textContent = ''; }

      var apiUrl = window.BOOKING_API_URL;
      if (!apiUrl || apiUrl.indexOf('PASTE_YOUR') !== -1) {
        if (submitErrorEl) {
          submitErrorEl.textContent = 'Online booking isn\'t fully set up yet. Please call or text us at (713) 269-1708 to book.';
        }
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'submitBooking', booking: buildBookingPayload() })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.ok) {
            throw new Error((data && data.error) || 'Something went wrong submitting your request.');
          }
          bookingForm.hidden = true;
          if (confirmationEl) {
            confirmationEl.hidden = false;
            confirmationEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        })
        .catch(function (err) {
          if (submitErrorEl) {
            submitErrorEl.textContent = err.message || 'Something went wrong submitting your request. Please try again or call/text us at (713) 269-1708.';
          }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Request My Appointment'; }
        });
    });
  }

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
