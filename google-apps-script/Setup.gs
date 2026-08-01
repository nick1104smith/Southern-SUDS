/* ==========================================================================
   ONE-TIME SETUP
   Run initializeSheets() once from the Apps Script editor (Run button, with
   this function selected) after pasting all files in. It creates the
   Bookings and Availability sheets with headers and sets default business
   hours (Mon–Sat, 8:00–19:00, closed Sunday) so the dashboard has something
   sensible to show immediately. Safe to re-run — it won't duplicate rows.
   ========================================================================== */

function initializeSheets() {
  bookingsSheet_();

  var sheet = availabilitySheet_();
  var data = sheet.getDataRange().getValues();
  var hasHours = false;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'Hours') { hasHours = true; break; }
  }

  if (!hasHours) {
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    days.forEach(function (day) {
      var isSunday = day === 'Sunday';
      sheet.appendRow(['Hours', day, '', '08:00', '19:00', isSunday ? 'TRUE' : 'FALSE', '']);
    });
  }

  Logger.log('Setup complete. Bookings and Availability sheets are ready.');
}
