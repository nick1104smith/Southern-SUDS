/* ==========================================================================
   EMAIL NOTIFICATIONS
   All customer-facing wording below is the exact copy approved for this
   system — do not reword without checking with the business owner first.
   ========================================================================== */

function formatDateLong_(dateStr) {
  if (!dateStr) { return ''; }
  try {
    var d = new Date(dateStr + 'T00:00:00');
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE, MMMM d, yyyy');
  } catch (e) {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/* Owner notifications                                                 */
/* ------------------------------------------------------------------ */

function sendOwnerNewRequestEmail_(booking) {
  var subject = 'NEW BOOKING REQUEST — ' + booking.customerName;
  var body =
    'NEW BOOKING REQUEST\n\n' +
    'Customer: ' + booking.customerName + '\n' +
    'Phone: ' + booking.phone + '\n' +
    'Email: ' + booking.email + '\n' +
    'Vehicle: ' + [booking.vehicleYear, booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ') + ' (' + booking.vehicleType + ')\n' +
    'Service: ' + booking.service + (booking.addons ? ' + ' + booking.addons : '') + '\n' +
    'Requested Date: ' + formatDateLong_(booking.requestedDate) + '\n' +
    'Requested Time: ' + (TIME_WINDOW_LABELS[booking.requestedTimeWindow] || booking.requestedTimeWindow) + '\n' +
    'Location: ' + booking.address + (booking.city ? ', ' + booking.city : '') + '\n' +
    'Price: ' + (booking.price || 'Not specified') + '\n' +
    'Customer Notes: ' + (booking.notes || 'None') + '\n\n' +
    'Open the owner dashboard to accept, propose a different time, or decline this request.';

  MailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, body);
  maybeSendSms_(null, 'New booking request from ' + booking.customerName + ' for ' + formatDateLong_(booking.requestedDate) + '. Check your dashboard.');
}

function sendOwnerCustomerRespondedEmail_(booking) {
  var subject = booking.customerName + ' confirmed a time — ' + CONFIG.BUSINESS_NAME;
  var body =
    booking.customerName + ' selected ' + formatDateLong_(booking.confirmedDate) + ' at ' + booking.confirmedTime + ' for their ' + booking.service + ' appointment.\n\n' +
    'Phone: ' + booking.phone + '\n' +
    'Email: ' + booking.email + '\n' +
    'Location: ' + booking.address + (booking.city ? ', ' + booking.city : '');
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, body);
}

/* ------------------------------------------------------------------ */
/* Customer notifications — exact approved wording                     */
/* ------------------------------------------------------------------ */

function sendCustomerRequestReceivedEmail_(booking) {
  var subject = 'We received your appointment request — ' + CONFIG.BUSINESS_NAME;
  var body =
    'Thanks for choosing Southern Suds Mobile Detailing. We received your appointment request for ' +
    formatDateLong_(booking.requestedDate) + ' at ' + (TIME_WINDOW_LABELS[booking.requestedTimeWindow] || booking.requestedTimeWindow) +
    '. Your appointment is currently pending review. We\'ll contact you shortly with confirmation.\n\n' +
    'Questions in the meantime? Call or text us at ' + CONFIG.BUSINESS_PHONE + '.';
  MailApp.sendEmail(booking.email, subject, body);
}

function sendCustomerAcceptedEmail_(booking) {
  var subject = 'Your appointment is confirmed — ' + CONFIG.BUSINESS_NAME;
  var body =
    'Your Southern Suds Mobile Detailing appointment is confirmed for ' +
    formatDateLong_(booking.confirmedDate) + ' at ' + booking.confirmedTime +
    '. We look forward to taking care of your vehicle.\n\n' +
    'Need to make changes? Call or text us at ' + CONFIG.BUSINESS_PHONE + '.';
  MailApp.sendEmail(booking.email, subject, body);
  maybeSendSms_(booking.phone, 'Your Southern Suds appointment is confirmed for ' + formatDateLong_(booking.confirmedDate) + ' at ' + booking.confirmedTime + '.');
}

function sendCustomerProposedTimesEmail_(booking) {
  var subject = 'Alternate times for your appointment — ' + CONFIG.BUSINESS_NAME;
  var link = CONFIG.RESPOND_URL + '?token=' + encodeURIComponent(booking.responseToken);

  var optionsText = booking.proposedTimes.map(function (t, i) {
    return (i + 1) + '. ' + formatDateLong_(t.date) + ' — ' + t.time;
  }).join('\n');

  var body =
    'Your requested appointment time is unavailable, but we have other options available. ' +
    'Please select the time that works best for you.\n\n' +
    optionsText + '\n\n' +
    'Choose your time here: ' + link + '\n\n' +
    'Questions? Call or text us at ' + CONFIG.BUSINESS_PHONE + '.';

  MailApp.sendEmail(booking.email, subject, body);
  maybeSendSms_(booking.phone, 'Southern Suds: your requested time isn\'t available. Pick a new time here: ' + link);
}

function sendCustomerDeclinedEmail_(booking) {
  var subject = 'Update on your appointment request — ' + CONFIG.BUSINESS_NAME;
  var body =
    'Unfortunately, we\'re unable to accommodate your requested appointment. Please contact us or submit another request for a different date.';
  if (booking.declineReason) {
    body += '\n\nNote from ' + CONFIG.BUSINESS_NAME + ': ' + booking.declineReason;
  }
  body += '\n\nCall or text us at ' + CONFIG.BUSINESS_PHONE + ' and we\'ll help find a time that works.';
  MailApp.sendEmail(booking.email, subject, body);
}

/* ------------------------------------------------------------------ */
/* SMS — optional, off by default                                      */
/* ------------------------------------------------------------------ */
//
// Apps Script has no built-in SMS sending. To turn SMS on later:
//   1. Create an account with an SMS API provider (e.g. Twilio).
//   2. Store the credentials in Script Properties (File > Project properties
//      > Script properties) — never hard-code them here.
//   3. Replace the body of sendSms_() below with an UrlFetchApp.fetch() call
//      to that provider's send-message endpoint.
//   4. Set CONFIG.SMS_ENABLED = true in Code.gs.
//
function maybeSendSms_(phone, message) {
  if (!CONFIG.SMS_ENABLED) { return; }
  try {
    sendSms_(phone, message);
  } catch (err) {
    Logger.log('SMS send failed: ' + err);
  }
}

function sendSms_(phone, message) {
  // Not yet configured — see the comment block above.
  Logger.log('SMS not configured. Would have sent to ' + phone + ': ' + message);
}
