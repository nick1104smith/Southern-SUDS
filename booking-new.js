/* ==========================================================================
   BOOKING SYSTEM v2 — CUSTOMER BOOKING FLOW
   ==========================================================================
   Drives booking-new.html. Vanilla JS, same style as the site's existing
   script.js. Talks to Supabase (or, in demo mode, localStorage — see
   booking-shared.js) rather than the old Google Apps Script backend.

   The price shown here is a PREVIEW only — the database independently
   recomputes and enforces the real price server-side from service_key +
   vehicle_size on every insert (see supabase/schema-v2-*.sql), so nothing
   sent from this file is trusted for billing purposes.
   ========================================================================== */
(function () {
  'use strict';

  var SS = window.SSBooking;
  var form = document.getElementById('bkv2-form');
  if (!SS || !form) { return; }

  var steps = Array.prototype.slice.call(document.querySelectorAll('#bkv2-form .booking-step'));
  var stepDots = Array.prototype.slice.call(document.querySelectorAll('#booking-v2-steps .booking-step-dot'));
  var confirmationEl = document.getElementById('bkv2-confirmation');
  var submitErrorEl = document.getElementById('bkv2-submit-error');
  var submitBtn = document.getElementById('bkv2-submit');
  var photoStatusEl = document.getElementById('bkv2-photo-status');

  var serviceField = document.getElementById('bkv2-service');
  var sizeGroup = document.getElementById('bkv2-size-group');
  var sizeField = document.getElementById('bkv2-size');
  var priceBox = document.getElementById('bkv2-price-box');
  var priceList = document.getElementById('bkv2-price-list');

  var photosInput = document.getElementById('bkv2-photos');
  var photoPreviewsEl = document.getElementById('bkv2-photo-previews');
  var photosErrorEl = document.getElementById('err-bkv2-photos');
  var selectedPhotoFiles = []; // authoritative list — native <input> FileList can't be edited directly

  var TIME_LABELS = { morning: 'Morning (8am–11am)', midday: 'Midday (11am–2pm)', afternoon: 'Afternoon (2pm–5pm)', evening: 'Evening (5pm–7pm)' };

  // Generated once per form session. Doubles as the booking's own id (sent
  // explicitly on insert) AND the idempotency guard — a retried submission
  // with the same id hits the primary-key unique constraint and is treated
  // as a harmless no-op rather than a duplicate booking. Also lets photos
  // reference the booking they belong to immediately, without a round trip.
  var bookingId = SS.uuid();

  function goToStep(n) {
    steps.forEach(function (s) { s.hidden = Number(s.getAttribute('data-step')) !== n; });
    stepDots.forEach(function (dot) {
      var d = Number(dot.getAttribute('data-step-dot'));
      dot.classList.toggle('is-active', d === n);
      dot.classList.toggle('is-complete', d < n);
    });
    if (n === 4) { renderReview(); }
    var wrap = document.getElementById('booking-v2-steps');
    if (wrap) { wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function updatePrice() {
    var key = serviceField.value;
    var svc = SS.SERVICES[key];
    if (!key || !svc) {
      priceBox.hidden = true;
      sizeGroup.hidden = true;
      sizeField.removeAttribute('required');
      return;
    }

    var needsSize = !!svc.tiered;
    sizeGroup.hidden = !needsSize;
    if (needsSize) {
      sizeField.setAttribute('required', 'required');
    } else {
      sizeField.removeAttribute('required');
      sizeField.value = '';
    }

    var result = SS.priceFor(key, sizeField.value);
    var rows = [['Service', svc.name]];
    if (sizeField.value) { rows.push(['Vehicle Size', SS.VEHICLE_SIZE_LABELS[sizeField.value]]); }
    rows.push(['Price', result ? result.label : '']);

    priceList.innerHTML = rows.map(function (r) { return '<li><span>' + r[0] + '</span><span>' + r[1] + '</span></li>'; }).join('');
    priceBox.hidden = false;
  }

  serviceField.addEventListener('change', updatePrice);
  sizeField.addEventListener('change', updatePrice);

  /* ---- photo selection + preview ------------------------------------- */
  function renderPhotoPreviews() {
    photoPreviewsEl.innerHTML = '';
    selectedPhotoFiles.forEach(function (file, idx) {
      var url = URL.createObjectURL(file);
      var thumb = document.createElement('div');
      thumb.className = 'photo-preview-thumb';
      thumb.innerHTML =
        '<img src="' + url + '" alt="Selected photo ' + (idx + 1) + '">' +
        '<button type="button" class="photo-preview-remove" aria-label="Remove photo" data-idx="' + idx + '">&times;</button>';
      photoPreviewsEl.appendChild(thumb);
    });
    photoPreviewsEl.querySelectorAll('.photo-preview-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedPhotoFiles.splice(Number(btn.getAttribute('data-idx')), 1);
        renderPhotoPreviews();
      });
    });
  }

  if (photosInput) {
    photosInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(photosInput.files || []);
      photosErrorEl.textContent = '';
      var accepted = [];
      var rejected = [];
      files.forEach(function (f) {
        var err = SS.validateImageFile(f);
        if (err) { rejected.push(f.name + ': ' + err); } else { accepted.push(f); }
      });
      selectedPhotoFiles = selectedPhotoFiles.concat(accepted);
      if (rejected.length) { photosErrorEl.textContent = rejected.join(' '); }
      photosInput.value = ''; // allow re-selecting the same file later, and avoid double-counting on next change
      renderPhotoPreviews();
    });
  }

  /* ---- validation (mirrors the site's existing script.js patterns) ------ */
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var phonePattern = /^[0-9()+\-.\s]{7,20}$/;

  function validateField(field) {
    var errorEl = document.getElementById('err-' + field.id);
    var group = field.closest('.form-group');
    var message = '';

    if (field.required && !field.value.trim()) {
      message = 'This field is required.';
    } else if (field.type === 'email' && field.value && !emailPattern.test(field.value)) {
      message = 'Please enter a valid email address.';
    } else if (field.type === 'tel' && field.value && !phonePattern.test(field.value)) {
      message = 'Please enter a valid phone number.';
    } else if (field.type === 'date' && field.value) {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var picked = new Date(field.value + 'T00:00:00');
      if (picked < today) { message = 'Please choose a date from today onward.'; }
    }

    if (errorEl) { errorEl.textContent = message; }
    if (group) { group.classList.toggle('has-error', Boolean(message)); }
    return message === '';
  }

  function validateStep(stepEl) {
    var fields = Array.prototype.slice.call(stepEl.querySelectorAll('[required]'));
    var ok = true, firstInvalid = null;
    fields.forEach(function (f) {
      if (!validateField(f)) { ok = false; if (!firstInvalid) { firstInvalid = f; } }
    });
    return { ok: ok, firstInvalid: firstInvalid };
  }

  Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (f) {
    f.addEventListener('input', function () { if (f.hasAttribute('required')) { validateField(f); } });
    f.addEventListener('change', function () { if (f.hasAttribute('required')) { validateField(f); } });
    f.addEventListener('blur', function () { if (f.hasAttribute('required')) { validateField(f); } });
  });

  document.querySelectorAll('.booking-next-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var stepEl = btn.closest('.booking-step');
      var result = validateStep(stepEl);
      if (!result.ok) {
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
    btn.addEventListener('click', function () { goToStep(Number(btn.getAttribute('data-step-back'))); });
  });

  /* ---- "which vehicle size is mine" modal -------------------------------- */
  document.querySelectorAll('[data-modal]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var modal = document.getElementById(trigger.getAttribute('data-modal'));
      if (modal) { modal.hidden = false; }
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(function (modal) {
    modal.addEventListener('click', function (e) { if (e.target === modal) { modal.hidden = true; } });
    var closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) { closeBtn.addEventListener('click', function () { modal.hidden = true; }); }
  });

  /* ---- payload + review --------------------------------------------------- */
  function fieldVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function selectedText(id) {
    var el = document.getElementById(id);
    return el && el.selectedIndex >= 0 ? el.options[el.selectedIndex].textContent.trim() : '';
  }

  function buildPayload() {
    var svcKey = serviceField.value;
    var svc = SS.SERVICES[svcKey];
    var size = sizeField.value;
    var priceResult = SS.priceFor(svcKey, size);

    return {
      id: bookingId,
      idempotency_key: bookingId,
      customer_name: fieldVal('bkv2-name'),
      phone: fieldVal('bkv2-phone'),
      email: fieldVal('bkv2-email'),
      address: fieldVal('bkv2-address'),
      service_key: svcKey,
      vehicle_size: size || null,
      // service/price below are only a client-side preview echoed back for
      // the review step — the database ignores both and recomputes them
      // itself from service_key + vehicle_size on insert.
      service: svc ? svc.name + (size ? ' — ' + SS.VEHICLE_SIZE_LABELS[size] : '') : '',
      vehicle_type: selectedText('bkv2-vehicle-type'),
      addons: [],
      price: priceResult ? priceResult.amount : null,
      price_is_estimate: priceResult ? priceResult.isEstimate : false,
      requested_date: fieldVal('bkv2-date'),
      requested_time: fieldVal('bkv2-time') ? TIME_LABELS[fieldVal('bkv2-time')] : '',
      notes: fieldVal('bkv2-notes'),
      status: 'pending'
    };
  }

  function renderReview() {
    var p = buildPayload();
    var rows = [
      ['Service', p.service],
      ['Vehicle Type', p.vehicle_type],
      ['Price', p.price !== null ? (p.price_is_estimate ? 'Starting at ' : '') + SS.formatMoney(p.price) : 'Custom Quote'],
      ['Name', p.customer_name],
      ['Phone', p.phone],
      ['Email', p.email],
      ['Address', p.address],
      ['Requested Date', p.requested_date],
      ['Requested Time', p.requested_time],
      ['Notes', p.notes || '—'],
      ['Photos Attached', selectedPhotoFiles.length ? selectedPhotoFiles.length + ' photo(s)' : 'None']
    ];
    var list = document.getElementById('bkv2-review-list');
    list.innerHTML = rows.map(function (r) {
      return '<li><span>' + r[0] + '</span><span>' + (r[1] || '—') + '</span></li>';
    }).join('');
  }

  function uploadSelectedPhotos() {
    if (!selectedPhotoFiles.length) { return Promise.resolve({ ok: 0, failed: 0 }); }
    if (photoStatusEl) {
      photoStatusEl.hidden = false;
      photoStatusEl.textContent = 'Uploading ' + selectedPhotoFiles.length + ' photo(s)…';
    }
    return Promise.all(selectedPhotoFiles.map(function (f) {
      return SS.uploadPhoto(bookingId, f, 'other', 'customer').then(
        function () { return true; },
        function (err) { console.error('Photo upload failed:', err); return false; }
      );
    })).then(function (results) {
      var ok = results.filter(Boolean).length;
      var failed = results.length - ok;
      if (photoStatusEl) {
        photoStatusEl.textContent = failed
          ? ok + ' of ' + results.length + ' photo(s) uploaded. ' + failed + ' failed — that’s okay, your booking request was still received.'
          : results.length + ' photo(s) uploaded successfully.';
      }
      return { ok: ok, failed: failed };
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Validate every step, not just the current one — covers a customer
    // who used browser back/forward to skip around.
    var ok = true, firstInvalid = null;
    steps.forEach(function (stepEl) {
      var r = validateStep(stepEl);
      if (!r.ok) { ok = false; if (!firstInvalid) { firstInvalid = r.firstInvalid; } }
    });
    if (!ok) {
      if (firstInvalid) {
        var stepEl = firstInvalid.closest('.booking-step');
        goToStep(Number(stepEl.getAttribute('data-step')));
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (submitErrorEl) { submitErrorEl.textContent = ''; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

    var payload = buildPayload();

    function onSuccess() {
      form.hidden = true;
      if (confirmationEl) {
        confirmationEl.hidden = false;
        confirmationEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Photos upload after the booking exists so they always have a valid
      // booking to attach to; failures here don't affect the booking itself.
      uploadSelectedPhotos();
    }
    function onError(message) {
      if (submitErrorEl) {
        submitErrorEl.textContent = message || 'Something went wrong submitting your request. Please try again or call/text us at (713) 269-1708.';
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Request My Appointment'; }
    }

    if (SS.DEMO_MODE) {
      var demoRow = Object.assign({}, payload, {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      SS.demoInsert(demoRow);
      setTimeout(onSuccess, 350); // brief pause so "Submitting…" is visible, like a real request
      return;
    }

    var client = SS.getClient();
    if (!client) { onError('Booking system is not configured yet.'); return; }

    client.from('bookings').insert([payload]).then(function (res) {
      if (res.error) {
        // Unique-constraint hit on id/idempotency_key means this exact
        // submission already succeeded once (e.g. a retried request) —
        // treat it as success rather than showing an error.
        if (res.error.code === '23505') { onSuccess(); return; }
        onError(res.error.message);
        return;
      }
      onSuccess();
    }).catch(function (err) {
      onError(err && err.message);
    });
  });

  goToStep(1);
})();
