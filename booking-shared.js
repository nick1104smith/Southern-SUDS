/* ==========================================================================
   BOOKING SYSTEM v2 — SHARED HELPERS
   ==========================================================================
   Loaded by booking-new.html and admin.html, after supabase-config.js and
   the Supabase JS CDN script. Holds the service/pricing catalog (mirrors
   both index.html's packages AND public.service_pricing — the database is
   the actual source of truth for what price gets charged; this copy only
   drives the live price preview in the UI), demo-mode detection, a
   localStorage-backed stand-in "database" for local preview without a
   Supabase project, photo upload/compression helpers, and formatting
   helpers.
   ========================================================================== */
window.SSBooking = (function () {
  'use strict';

  var DEMO_KEY = 'ss_demo_bookings_v1';

  var DEMO_MODE = !window.SUPABASE_URL ||
    !window.SUPABASE_ANON_KEY ||
    window.SUPABASE_URL.indexOf('YOUR_SUPABASE') !== -1 ||
    window.SUPABASE_ANON_KEY.indexOf('YOUR_SUPABASE') !== -1;

  var client = null;
  function getClient() {
    if (DEMO_MODE) { return null; }
    if (!client && window.supabase) {
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    return client;
  }

  /* ---- Service catalog — mirrors public.service_pricing. The database   */
  /* trigger (compute_booking_price) is what actually decides the charged  */
  /* price; this copy only drives the live estimate shown while booking.   */
  var SERVICES = {
    'southern-wash':    { name: 'Southern Wash', price: 99, startingAt: true },
    'standard-refresh': { name: 'Southern Standard Refresh', tiered: true, prices: { compact: 185, 'full-size': 200, larger: 215 } },
    'full-detail':      { name: 'Full Southern Detail', tiered: true, prices: { compact: 280, 'full-size': 300, larger: 320 } },
    'full-restoration': { name: 'Full Restoration Detail', tiered: true, prices: { compact: 485, 'full-size': 500, larger: 520 } },
    'interior-1':       { name: 'Interior Detailing — Level 1 (Base Interior Maintenance)', tiered: true, prices: { compact: 120, 'full-size': 135, larger: 150 } },
    'interior-2':       { name: 'Interior Detailing — Level 2 (Moderate Interior Detail)', tiered: true, prices: { compact: 175, 'full-size': 200, larger: 225 } },
    'interior-3':       { name: 'Interior Detailing — Level 3 (Extreme Interior Detail)', tiered: true, startingAt: true, prices: { compact: 289, 'full-size': 315, larger: 345 } },
    'ceramic':          { name: 'Ceramic Protection', price: 599 },
    'pet-hair':         { name: 'Pet-Hair Removal', price: 89, startingAt: true },
    'stain-removal':    { name: 'Stain & Spill Treatment', price: 129 },
    'odor-1':           { name: 'Odor Treatment — Level 1 (Light Odor)', price: 149.99 },
    'odor-2':           { name: 'Odor Treatment — Level 2 (Strong / Lingering Odor)', price: 249.99 },
    'engine-bay':       { name: 'Engine Bay Cleaning', price: 150 },
    'headlight':        { name: 'Headlight Restoration', price: 200 },
    'mold-1':           { name: 'Mold Remediation — Level 1', price: 399 },
    'mold-2':           { name: 'Mold Remediation — Level 2', price: 599 },
    'mold-3':           { name: 'Mold Remediation — Level 3', price: 899 },
    'mold-4':           { name: 'Mold Remediation — Level 4', price: 1240 },
    'fleet':            { name: 'Fleet & Commercial Detailing', quote: true },
    'not-sure':         { name: 'Not Sure / Need Help Choosing', quote: true }
  };

  var VEHICLE_SIZE_LABELS = { compact: 'Compact Car', 'full-size': 'Full-Size Car', larger: 'Larger Vehicle / Truck' };

  var STATUSES = ['pending', 'confirmed', 'declined', 'completed', 'cancelled'];
  var STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', declined: 'Declined', completed: 'Completed', cancelled: 'Cancelled' };

  var PHOTO_CATEGORIES = ['before', 'after', 'damage', 'other'];
  var PHOTO_CATEGORY_LABELS = { before: 'Before', after: 'After', damage: 'Damage', other: 'Other' };

  function formatMoney(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) { return ''; }
    var rounded = Math.round(amount * 100) / 100;
    var hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
    var str = hasCents ? rounded.toFixed(2) : String(Math.round(rounded));
    var parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '$' + parts.join('.');
  }

  // Returns { amount, label, isEstimate, needsSize } or null for an unknown key.
  // This is a PREVIEW only — the database recomputes and enforces the real
  // price server-side on every insert, so a tampered client can't change
  // what's actually charged (see supabase/schema-v2-*.sql).
  function priceFor(serviceKey, sizeKey) {
    var svc = SERVICES[serviceKey];
    if (!svc) { return null; }
    if (svc.quote) { return { amount: null, label: 'Custom Quote', isEstimate: false, needsSize: false }; }
    if (svc.tiered) {
      if (!sizeKey || svc.prices[sizeKey] === undefined) {
        return { amount: null, label: 'Select vehicle size for exact price', isEstimate: !!svc.startingAt, needsSize: true };
      }
      var amt = svc.prices[sizeKey];
      return { amount: amt, label: (svc.startingAt ? 'Starting at ' : '') + formatMoney(amt), isEstimate: !!svc.startingAt, needsSize: true };
    }
    return { amount: svc.price, label: (svc.startingAt ? 'Starting at ' : '') + formatMoney(svc.price), isEstimate: !!svc.startingAt, needsSize: false };
  }

  /* ---- Demo-mode local "database" (localStorage) ------------------------ */
  function demoGetAll() {
    try {
      var list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function demoSaveAll(list) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
  }
  function demoInsert(booking) {
    var list = demoGetAll();
    booking.photos = booking.photos || [];
    booking.admin_viewed_at = booking.admin_viewed_at || null;
    list.unshift(booking);
    demoSaveAll(list);
    return booking;
  }
  function demoFind(id) {
    var list = demoGetAll();
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }
  function demoUpdate(id, patch) {
    var list = demoGetAll();
    var row = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        row = Object.assign(list[i], patch, { updated_at: new Date().toISOString() });
        break;
      }
    }
    if (row) { demoSaveAll(list); }
    return row;
  }
  function demoUpdateStatus(id, status) { return demoUpdate(id, { status: status }); }
  function demoAddPhoto(bookingId, photo) {
    var row = demoFind(bookingId);
    if (!row) { return null; }
    row.photos = row.photos || [];
    row.photos.unshift(photo);
    demoSaveAll(demoGetAll());
    return photo;
  }
  function demoDeletePhoto(bookingId, photoId) {
    var row = demoFind(bookingId);
    if (!row || !row.photos) { return; }
    row.photos = row.photos.filter(function (p) { return p.id !== photoId; });
    demoSaveAll(demoGetAll());
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) { return window.crypto.randomUUID(); }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /* ---- Photo upload: validation, compression, storage ------------------- */
  var IMAGE_MAX_BYTES = 8 * 1024 * 1024; // matches the storage bucket's own limit
  var IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
  var COMPRESS_MAX_DIM = 1920;

  function validateImageFile(file) {
    if (IMAGE_ALLOWED_TYPES.indexOf(file.type) === -1) {
      return 'Only JPG, PNG, and WebP images are allowed.';
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return 'That image is too large (max 8MB).';
    }
    return null;
  }

  // Downscales/re-encodes large images client-side before upload so the
  // site never has to serve unnecessarily huge originals. Small images pass
  // through untouched. Resolves { blob, ext, type }.
  function compressImage(file) {
    if (file.size <= COMPRESS_ABOVE_BYTES) {
      var ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      return Promise.resolve({ blob: file, ext: ext, type: file.type });
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Could not process image.')); return; }
          resolve({ blob: blob, ext: 'jpg', type: 'image/jpeg' });
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image.')); };
      img.src = url;
    });
  }

  // Uploads one photo for a booking (real mode: Storage + booking_photos
  // row; demo mode: localStorage data URL) and resolves a photo record
  // shaped the same way either way, so admin.js can render both uniformly.
  function uploadPhoto(bookingId, file, category, uploadedBy) {
    var err = validateImageFile(file);
    if (err) { return Promise.reject(new Error(err)); }

    var photoId = uuid();

    if (DEMO_MODE) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var record = {
            id: photoId,
            booking_id: bookingId,
            storage_path: null,
            data_url: reader.result,
            category: category,
            uploaded_by: uploadedBy,
            created_at: new Date().toISOString()
          };
          demoAddPhoto(bookingId, record);
          resolve(record);
        };
        reader.onerror = function () { reject(new Error('Could not read image.')); };
        reader.readAsDataURL(file);
      });
    }

    var sbClient = getClient();
    return compressImage(file).then(function (out) {
      var path = bookingId + '/' + photoId + '.' + out.ext;
      return sbClient.storage.from('booking-photos').upload(path, out.blob, { contentType: out.type, upsert: false })
        .then(function (uploadRes) {
          if (uploadRes.error) { throw uploadRes.error; }
          return sbClient.from('booking_photos').insert([{
            id: photoId,
            booking_id: bookingId,
            storage_path: path,
            category: category,
            uploaded_by: uploadedBy
          }]);
        })
        .then(function (insertRes) {
          if (insertRes.error) { throw insertRes.error; }
          return {
            id: photoId,
            booking_id: bookingId,
            storage_path: path,
            category: category,
            uploaded_by: uploadedBy,
            created_at: new Date().toISOString()
          };
        });
    });
  }

  function getPhotos(bookingId) {
    if (DEMO_MODE) {
      var row = demoFind(bookingId);
      return Promise.resolve(row && row.photos ? row.photos : []);
    }
    var sbClient = getClient();
    return sbClient.from('booking_photos').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { throw res.error; }
        return res.data || [];
      });
  }

  function getPhotoUrl(photo) {
    if (DEMO_MODE) { return Promise.resolve(photo.data_url); }
    var sbClient = getClient();
    return sbClient.storage.from('booking-photos').createSignedUrl(photo.storage_path, 3600).then(function (res) {
      if (res.error) { throw res.error; }
      return res.data.signedUrl;
    });
  }

  function deletePhoto(bookingId, photo) {
    if (DEMO_MODE) {
      demoDeletePhoto(bookingId, photo.id);
      return Promise.resolve();
    }
    var sbClient = getClient();
    return sbClient.storage.from('booking-photos').remove([photo.storage_path]).then(function () {
      return sbClient.from('booking_photos').delete().eq('id', photo.id);
    }).then(function (res) {
      if (res && res.error) { throw res.error; }
    });
  }

  return {
    DEMO_MODE: DEMO_MODE,
    getClient: getClient,
    SERVICES: SERVICES,
    VEHICLE_SIZE_LABELS: VEHICLE_SIZE_LABELS,
    STATUSES: STATUSES,
    STATUS_LABELS: STATUS_LABELS,
    PHOTO_CATEGORIES: PHOTO_CATEGORIES,
    PHOTO_CATEGORY_LABELS: PHOTO_CATEGORY_LABELS,
    formatMoney: formatMoney,
    priceFor: priceFor,
    demoGetAll: demoGetAll,
    demoInsert: demoInsert,
    demoFind: demoFind,
    demoUpdate: demoUpdate,
    demoUpdateStatus: demoUpdateStatus,
    uuid: uuid,
    validateImageFile: validateImageFile,
    compressImage: compressImage,
    uploadPhoto: uploadPhoto,
    getPhotos: getPhotos,
    getPhotoUrl: getPhotoUrl,
    deletePhoto: deletePhoto
  };
})();
