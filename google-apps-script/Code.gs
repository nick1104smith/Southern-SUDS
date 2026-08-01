/* ==========================================================================
   SOUTHERN SUDS MOBILE DETAILING — BOOKING BACKEND (Google Apps Script)
   ==========================================================================
   This is the entire backend for the booking-request system. It runs on
   Google's servers (free), stores data in a bound Google Sheet, and sends
   email notifications. No external database, no paid hosting, no API keys
   stored in the website's frontend.

   SETUP: see ../BOOKING-SYSTEM-SETUP.md for the full step-by-step guide.
   You must fill in CONFIG.OWNER_EMAIL below before deploying.
   ========================================================================== */

var CONFIG = {
  // The Google account email that owns/manages this business. The owner
  // dashboard (Dashboard.html) only renders for whoever is logged into this
  // exact Google account — everyone else gets a blank "not authorized" page.
  OWNER_EMAIL: 'REPLACE_WITH_OWNER_GMAIL@gmail.com',

  BUSINESS_NAME: 'Southern Suds Mobile Detailing',
  BUSINESS_PHONE: '(713) 269-1708',
  BUSINESS_PHONE_TEL: '+17132691708',

  // Public URL of your live website. Used to build the link customers click
  // when you propose alternate times. Set this after your site is deployed;
  // leave the placeholder and links will still work if you paste the full
  // response.html URL manually into CONFIG.RESPOND_URL below.
  RESPOND_URL: 'https://REPLACE_WITH_YOUR_DOMAIN/respond.html',

  // Set to true only after you have wired up an SMS provider in sendSms()
  // inside Emails.gs. Left false, SMS is simply skipped (email still sends).
  SMS_ENABLED: false
};

var BOOKINGS_SHEET_NAME = 'Bookings';
var AVAILABILITY_SHEET_NAME = 'Availability';

var BOOKING_HEADERS = [
  'id', 'createdAt', 'status', 'customerName', 'phone', 'email',
  'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleType',
  'service', 'addons', 'price', 'requestedDate', 'requestedTimeWindow',
  'address', 'city', 'notes', 'confirmedDate', 'confirmedTime',
  'proposedTimes', 'responseToken', 'declineReason', 'updatedAt',
  'finalPrice', 'invoiceNumber', 'invoiceSentAt'
];

var AVAILABILITY_HEADERS = ['type', 'day', 'date', 'startTime', 'endTime', 'closed', 'note'];

var TIME_WINDOW_LABELS = {
  morning: 'Morning (8am–11am)',
  midday: 'Midday (11am–2pm)',
  afternoon: 'Afternoon (2pm–5pm)',
  evening: 'Evening (5pm–7pm)'
};

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

// Handles GET requests. Two behaviors depending on the deployment that
// receives the request:
//  - Public deployment (Anyone, even anonymous): only responds to
//    ?action=getByToken, used by respond.html. Anything else (including a
//    bare visit to the URL) falls through to the owner check below, which
//    fails for anonymous visitors and returns a blank/not-authorized page.
//  - Owner deployment (Only myself): a bare visit renders the dashboard,
//    gated by Session.getEffectiveUser().
function doGet(e) {
  var params = (e && e.parameter) || {};

  if (params.action === 'getByToken' && params.token) {
    return jsonResponse(getBookingByToken_(params.token));
  }

  var activeEmail = Session.getEffectiveUser().getEmail();
  if (!activeEmail || activeEmail.toLowerCase() !== CONFIG.OWNER_EMAIL.toLowerCase()) {
    return HtmlService.createHtmlOutput('<p>Not authorized.</p>');
  }

  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Southern Suds — Owner Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Handles POST requests from the public website: new booking submissions
// and a customer's selection of a proposed alternate time. Both are
// intentionally anonymous — no login required, matching how the booking
// form worked before this system existed.
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Invalid request body.' });
  }

  try {
    if (body.action === 'submitBooking') {
      return jsonResponse(submitBooking_(body.booking));
    }
    if (body.action === 'respondToProposal') {
      return jsonResponse(respondToProposal_(body.token, body.selectedIndex));
    }
    return jsonResponse({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Lets Dashboard.html pull in shared CSS/JS partials if it ever needs to;
// not required for the current single-file dashboard but harmless to keep.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                       */
/* ------------------------------------------------------------------ */

function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function bookingsSheet_() { return getSheet_(BOOKINGS_SHEET_NAME, BOOKING_HEADERS); }
function availabilitySheet_() { return getSheet_(AVAILABILITY_SHEET_NAME, AVAILABILITY_HEADERS); }

// Sheets silently auto-converts date-looking text into real Date-typed
// cells even when the code writes a plain string, so any of these columns
// can come back from getValues() as a Date object instead of text. Coerce
// them back to strings here — an unconverted Date breaks both date-string
// comparisons elsewhere (e.g. isDateBlocked_) and can silently break the
// google.script.run response on the client without ever throwing an error.
var DATE_ONLY_FIELDS = { requestedDate: true, confirmedDate: true };

function rowToBooking_(row) {
  var obj = {};
  BOOKING_HEADERS.forEach(function (key, i) {
    var value = row[i];
    if (value instanceof Date) {
      value = DATE_ONLY_FIELDS[key]
        ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : value.toISOString();
    }
    obj[key] = value;
  });
  try { obj.proposedTimes = obj.proposedTimes ? JSON.parse(obj.proposedTimes) : []; } catch (e) { obj.proposedTimes = []; }
  return obj;
}

function bookingToRow_(b) {
  return BOOKING_HEADERS.map(function (key) {
    if (key === 'proposedTimes') { return JSON.stringify(b.proposedTimes || []); }
    return b[key] !== undefined && b[key] !== null ? b[key] : '';
  });
}

function findBookingRowIndex_(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) { return i + 1; /* 1-based sheet row */ }
  }
  return -1;
}

function getBookingById_(id) {
  var sheet = bookingsSheet_();
  var rowIndex = findBookingRowIndex_(sheet, id);
  if (rowIndex === -1) { return null; }
  var row = sheet.getRange(rowIndex, 1, 1, BOOKING_HEADERS.length).getValues()[0];
  return rowToBooking_(row);
}

function saveBooking_(booking) {
  var sheet = bookingsSheet_();
  var rowIndex = findBookingRowIndex_(sheet, booking.id);
  var row = bookingToRow_(booking);
  if (rowIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  }
}

/* ------------------------------------------------------------------ */
/* Public: booking submission                                          */
/* ------------------------------------------------------------------ */

function submitBooking_(input) {
  if (!input || !input.customerName || !input.phone || !input.email || !input.requestedDate) {
    return { ok: false, error: 'Missing required booking fields.' };
  }

  var blockCheck = isDateBlocked_(input.requestedDate);
  if (blockCheck.blocked) {
    return { ok: false, error: 'We are not available on ' + input.requestedDate + ' (' + blockCheck.reason + '). Please choose another date.' };
  }

  var now = new Date().toISOString();
  var booking = {
    id: Utilities.getUuid(),
    createdAt: now,
    status: 'PENDING',
    customerName: input.customerName,
    phone: input.phone,
    email: input.email,
    vehicleYear: input.vehicleYear || '',
    vehicleMake: input.vehicleMake || '',
    vehicleModel: input.vehicleModel || '',
    vehicleType: input.vehicleType || '',
    service: input.service || '',
    addons: input.addons || '',
    price: input.price || '',
    requestedDate: input.requestedDate,
    requestedTimeWindow: input.requestedTimeWindow || '',
    address: input.address || '',
    city: input.city || '',
    notes: input.notes || '',
    confirmedDate: '',
    confirmedTime: '',
    proposedTimes: [],
    responseToken: '',
    declineReason: '',
    updatedAt: now
  };

  saveBooking_(booking);
  sendOwnerNewRequestEmail_(booking);
  sendCustomerRequestReceivedEmail_(booking);

  return { ok: true, id: booking.id };
}

/* ------------------------------------------------------------------ */
/* Public: customer responds to a proposed alternate time              */
/* ------------------------------------------------------------------ */

function getBookingByToken_(token) {
  var sheet = bookingsSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var booking = rowToBooking_(data[i]);
    if (booking.responseToken === token) {
      return {
        ok: true,
        booking: {
          id: booking.id,
          customerName: booking.customerName,
          service: booking.service,
          status: booking.status,
          proposedTimes: booking.proposedTimes
        }
      };
    }
  }
  return { ok: false, error: 'This link is no longer valid.' };
}

function respondToProposal_(token, selectedIndex) {
  var sheet = bookingsSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var booking = rowToBooking_(data[i]);
    if (booking.responseToken === token) {
      if (booking.status !== 'PENDING') {
        return { ok: false, error: 'This request has already been handled.' };
      }
      var choice = booking.proposedTimes[selectedIndex];
      if (!choice) { return { ok: false, error: 'Invalid selection.' }; }

      booking.status = 'CONFIRMED';
      booking.confirmedDate = choice.date;
      booking.confirmedTime = choice.time;
      booking.updatedAt = new Date().toISOString();
      saveBooking_(booking);

      sendCustomerAcceptedEmail_(booking);
      sendOwnerCustomerRespondedEmail_(booking);
      return { ok: true };
    }
  }
  return { ok: false, error: 'This link is no longer valid.' };
}

/* ------------------------------------------------------------------ */
/* Owner dashboard: read functions (called via google.script.run)      */
/* ------------------------------------------------------------------ */

function requireOwner_() {
  var activeEmail = Session.getEffectiveUser().getEmail();
  if (!activeEmail || activeEmail.toLowerCase() !== CONFIG.OWNER_EMAIL.toLowerCase()) {
    throw new Error('Not authorized.');
  }
}

function getBookingsByStatus(status) {
  requireOwner_();
  var sheet = bookingsSheet_();
  var data = sheet.getDataRange().getValues();
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var booking = rowToBooking_(data[i]);
    if (!status || booking.status === status) { results.push(booking); }
  }
  results.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return results;
}

function getBookingDetail(id) {
  requireOwner_();
  return getBookingById_(id);
}

function getConfirmedForCalendar() {
  requireOwner_();
  return getBookingsByStatus('CONFIRMED');
}

/* ------------------------------------------------------------------ */
/* Owner dashboard: action functions                                   */
/* ------------------------------------------------------------------ */

function checkConflict(id, date) {
  requireOwner_();
  var sheet = bookingsSheet_();
  var data = sheet.getDataRange().getValues();
  var conflicts = [];
  for (var i = 1; i < data.length; i++) {
    var booking = rowToBooking_(data[i]);
    if (booking.status === 'CONFIRMED' && booking.confirmedDate === date && String(booking.id) !== String(id)) {
      conflicts.push({ customerName: booking.customerName, time: booking.confirmedTime });
    }
  }
  return conflicts;
}

function acceptBooking(id) {
  requireOwner_();
  var booking = getBookingById_(id);
  if (!booking) { return { ok: false, error: 'Booking not found.' }; }

  booking.status = 'CONFIRMED';
  booking.confirmedDate = booking.requestedDate;
  booking.confirmedTime = TIME_WINDOW_LABELS[booking.requestedTimeWindow] || booking.requestedTimeWindow;
  booking.updatedAt = new Date().toISOString();
  saveBooking_(booking);

  sendCustomerAcceptedEmail_(booking);
  return { ok: true };
}

function proposeTimes(id, times) {
  requireOwner_();
  var booking = getBookingById_(id);
  if (!booking) { return { ok: false, error: 'Booking not found.' }; }
  if (!times || !times.length) { return { ok: false, error: 'Add at least one alternate time.' }; }

  booking.proposedTimes = times;
  booking.responseToken = booking.responseToken || Utilities.getUuid();
  booking.updatedAt = new Date().toISOString();
  saveBooking_(booking);

  sendCustomerProposedTimesEmail_(booking);
  return { ok: true };
}

function declineBooking(id, reason) {
  requireOwner_();
  var booking = getBookingById_(id);
  if (!booking) { return { ok: false, error: 'Booking not found.' }; }

  booking.status = 'DECLINED';
  booking.declineReason = reason || '';
  booking.updatedAt = new Date().toISOString();
  saveBooking_(booking);

  sendCustomerDeclinedEmail_(booking);
  return { ok: true };
}

function markCompleted(id) {
  requireOwner_();
  var booking = getBookingById_(id);
  if (!booking) { return { ok: false, error: 'Booking not found.' }; }
  booking.status = 'COMPLETED';
  booking.updatedAt = new Date().toISOString();
  saveBooking_(booking);
  return { ok: true };
}

function cancelBooking(id) {
  requireOwner_();
  var booking = getBookingById_(id);
  if (!booking) { return { ok: false, error: 'Booking not found.' }; }
  booking.status = 'CANCELLED';
  booking.updatedAt = new Date().toISOString();
  saveBooking_(booking);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Invoices / receipts                                                 */
/* ------------------------------------------------------------------ */

// The owner can override the originally-quoted price before an invoice
// goes out (final price often differs once the job is actually scoped).
function updateFinalPrice(id, finalPrice) {
  requireOwner_();
  var booking = getBookingById_(id);
  if (!booking) { return { ok: false, error: 'Booking not found.' }; }
  booking.finalPrice = finalPrice;
  booking.updatedAt = new Date().toISOString();
  saveBooking_(booking);
  return { ok: true };
}

// sendToCustomer true emails the PDF invoice straight to the customer and
// records invoiceSentAt. False emails the same PDF to the owner instead, so
// it can be forwarded, texted, or printed manually — this is the "create one
// for me to send" path.
function emailInvoice(id, sendToCustomer) {
  requireOwner_();
  var booking = getBookingById_(id);
  if (!booking) { return { ok: false, error: 'Booking not found.' }; }

  if (!booking.invoiceNumber) {
    booking.invoiceNumber = 'INV-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    saveBooking_(booking);
  }

  var pdf = buildInvoicePdf_(booking);
  var recipient = sendToCustomer ? booking.email : CONFIG.OWNER_EMAIL;
  var subject = 'Invoice ' + booking.invoiceNumber + ' — ' + CONFIG.BUSINESS_NAME;
  var body = sendToCustomer
    ? 'Hi ' + booking.customerName + ',\n\nPlease find your invoice attached. Thank you for choosing ' + CONFIG.BUSINESS_NAME + '.\n\nQuestions? Call or text us at ' + CONFIG.BUSINESS_PHONE + '.'
    : 'Invoice ' + booking.invoiceNumber + ' for ' + booking.customerName + ' is attached, ready to forward to the customer yourself.';

  MailApp.sendEmail({ to: recipient, subject: subject, body: body, attachments: [pdf] });

  if (sendToCustomer) {
    booking.invoiceSentAt = new Date().toISOString();
    saveBooking_(booking);
  }

  return { ok: true, invoiceNumber: booking.invoiceNumber };
}

function buildInvoicePdf_(booking) {
  var finalPrice = booking.finalPrice || booking.price || 'Not specified';
  var todayLabel = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');

  var html =
    '<html><body style="font-family:Arial,sans-serif;padding:32px;color:#222;">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
    '<div><h1 style="margin:0;color:#ef1b1b;">' + CONFIG.BUSINESS_NAME + '</h1>' +
    '<p style="margin:4px 0;color:#555;">' + CONFIG.BUSINESS_PHONE + '</p></div>' +
    '<div style="text-align:right;"><h2 style="margin:0;">INVOICE</h2>' +
    '<p style="margin:4px 0;">' + booking.invoiceNumber + '</p>' +
    '<p style="margin:4px 0;">' + todayLabel + '</p></div>' +
    '</div>' +
    '<hr style="margin:24px 0;border:none;border-top:2px solid #ef1b1b;">' +
    '<p><strong>Bill To:</strong><br>' + booking.customerName + '<br>' + booking.phone + '<br>' + booking.email + '<br>' +
    booking.address + (booking.city ? ', ' + booking.city : '') + '</p>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:20px;">' +
    '<tr style="background:#f4f4f4;"><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd;">Description</th>' +
    '<th style="text-align:right;padding:10px;border-bottom:1px solid #ddd;">Amount</th></tr>' +
    '<tr><td style="padding:10px;border-bottom:1px solid #eee;">' + booking.service + '</td><td style="padding:10px;border-bottom:1px solid #eee;"></td></tr>' +
    (booking.addons ? '<tr><td style="padding:10px;border-bottom:1px solid #eee;">Add-ons: ' + booking.addons + '</td><td style="border-bottom:1px solid #eee;"></td></tr>' : '') +
    '<tr><td style="padding:14px 10px;font-weight:bold;">Total</td><td style="text-align:right;padding:14px 10px;font-weight:bold;">' + finalPrice + '</td></tr>' +
    '</table>' +
    '<p style="margin-top:36px;color:#777;font-size:12px;">Thank you for choosing ' + CONFIG.BUSINESS_NAME + '.</p>' +
    '</body></html>';

  var blob = Utilities.newBlob(html, 'text/html', 'invoice.html').getAs('application/pdf');
  blob.setName('Invoice-' + booking.invoiceNumber + '.pdf');
  return blob;
}

/* ------------------------------------------------------------------ */
/* Availability management                                             */
/* ------------------------------------------------------------------ */

function isDateBlocked_(dateStr) {
  var sheet = availabilitySheet_();
  var data = sheet.getDataRange().getValues();
  var date = new Date(dateStr + 'T00:00:00');
  var dayName = Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE');

  for (var i = 1; i < data.length; i++) {
    var row = availabilityRowToObj_(data[i]);
    if (row.type === 'BlockedDate' && row.date === dateStr) {
      return { blocked: true, reason: row.note || 'unavailable' };
    }
    if (row.type === 'Hours' && row.day === dayName && row.closed) {
      return { blocked: true, reason: 'closed on ' + dayName + 's' };
    }
  }
  return { blocked: false };
}

function availabilityRowToObj_(row) {
  var obj = {};
  AVAILABILITY_HEADERS.forEach(function (key, i) {
    var value = row[i];
    if (value instanceof Date) {
      value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    obj[key] = value;
  });
  obj.closed = obj.closed === true || obj.closed === 'TRUE' || obj.closed === 'true';
  return obj;
}

function getAvailability() {
  requireOwner_();
  var sheet = availabilitySheet_();
  var data = sheet.getDataRange().getValues();
  var hours = [];
  var blockedDates = [];
  var blockedTimes = [];
  for (var i = 1; i < data.length; i++) {
    var row = availabilityRowToObj_(data[i]);
    row._rowIndex = i + 1;
    if (row.type === 'Hours') { hours.push(row); }
    else if (row.type === 'BlockedDate') { blockedDates.push(row); }
    else if (row.type === 'BlockedTime') { blockedTimes.push(row); }
  }
  return { hours: hours, blockedDates: blockedDates, blockedTimes: blockedTimes };
}

function setBusinessHours(day, startTime, endTime, closed) {
  requireOwner_();
  var sheet = availabilitySheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = availabilityRowToObj_(data[i]);
    if (row.type === 'Hours' && row.day === day) {
      sheet.getRange(i + 1, 1, 1, AVAILABILITY_HEADERS.length).setValues([
        ['Hours', day, '', startTime, endTime, closed ? 'TRUE' : 'FALSE', '']
      ]);
      return { ok: true };
    }
  }
  sheet.appendRow(['Hours', day, '', startTime, endTime, closed ? 'TRUE' : 'FALSE', '']);
  return { ok: true };
}

function addBlockedDate(date, note) {
  requireOwner_();
  availabilitySheet_().appendRow(['BlockedDate', '', date, '', '', 'TRUE', note || '']);
  return { ok: true };
}

function addBlockedTime(date, startTime, endTime, note) {
  requireOwner_();
  availabilitySheet_().appendRow(['BlockedTime', '', date, startTime, endTime, 'TRUE', note || '']);
  return { ok: true };
}

function removeAvailabilityRow(rowIndex) {
  requireOwner_();
  availabilitySheet_().deleteRow(rowIndex);
  return { ok: true };
}
