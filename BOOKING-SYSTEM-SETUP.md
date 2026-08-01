# Booking System Setup Guide

This is the one-time setup for the booking-request system: Google Sheets +
Google Apps Script as the backend, a private owner dashboard, and email
notifications. No paid services, no Supabase, no server to maintain.

You'll need one Google account to manage the business (a personal Gmail
account is fine). Whatever account you use in step 1 becomes the **only**
account that can open the owner dashboard.

## 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new
   blank spreadsheet. Name it something like "Southern Suds Bookings."
2. In the menu, go to **Extensions → Apps Script**. This opens a script
   editor already linked to this sheet — the sheet is the database, the
   script is the backend.

## 2. Add the code files

The Apps Script editor starts with one empty `Code.gs` file. You're going to
replace/add files so the editor matches the files in this project's
`google-apps-script/` folder:

1. Delete the placeholder contents of `Code.gs` and paste in the full
   contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
2. Click the **+** next to "Files" → **Script** → name it `Emails` → paste
   in [`google-apps-script/Emails.gs`](google-apps-script/Emails.gs).
3. Click **+** → **Script** → name it `Setup` → paste in
   [`google-apps-script/Setup.gs`](google-apps-script/Setup.gs).
4. Click **+** → **HTML** → name it exactly `Dashboard` (Apps Script adds
   `.html` for you) → paste in
   [`google-apps-script/Dashboard.html`](google-apps-script/Dashboard.html).
5. Save the project (Ctrl/Cmd+S).

## 3. Configure it

Open `Code.gs` and edit the `CONFIG` block at the top:

- `OWNER_EMAIL` — the exact Gmail/Google Workspace address you'll log in
  with to manage bookings. **Only this account will ever be able to open
  the dashboard.**
- `RESPOND_URL` — once your site is live, set this to
  `https://yourdomain.com/respond.html`. Until then you can leave the
  placeholder; you'll just need to come back and update it (see step 7).

Also set the project's time zone: **Project Settings** (gear icon) →
**Time zone** → pick your local zone (Houston is `America/Chicago`). This
keeps dates/times in emails and the dashboard correct.

## 4. Run the one-time setup

1. In the function dropdown at the top of the editor, select
   `initializeSheets`.
2. Click **Run**. The first time, Google will ask you to authorize the
   script (it needs permission to edit the sheet and send email as you) —
   review and click **Allow**.
3. Check your spreadsheet — you should now see two tabs: `Bookings` and
   `Availability` (pre-filled with Monday–Saturday 8am–7pm, closed Sunday).

## 5. Deploy — twice

You need **two separate deployments** of the same code: one public (for the
booking form and the customer time-picker), one private (the owner
dashboard). This is what keeps the dashboard from being publicly reachable
without you having to build any custom login system.

**Deployment A — Booking API (public):**
1. Click **Deploy → New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Click **Deploy**, authorize again if asked, then copy the Web app URL.
   This is your `BOOKING_API_URL`.

**Deployment B — Owner Dashboard (private):**
1. Click **Deploy → New deployment** again (yes, a second one).
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Only myself**.
5. Click **Deploy**, then copy this Web app URL — this is your private
   dashboard link. Bookmark it. Anyone who isn't logged into
   `OWNER_EMAIL` and opens this link sees a blank "Not authorized" page —
   Google enforces this before your code even runs.

## 6. Connect the website

Open [`script.js`](script.js) and find this line near the top:

```js
window.BOOKING_API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
```

Replace the placeholder with **Deployment A's** URL (the public one, not
the dashboard one). `respond.html` reads the same value automatically —
nothing else to configure there.

## 7. When your code changes later

Apps Script deployments are frozen at whatever code existed when you last
deployed — editing `Code.gs` does **not** update a live deployment by
itself. After any code change (including updating `RESPOND_URL`), go to
**Deploy → Manage deployments**, click the pencil icon on each deployment,
and choose **New version** → **Deploy**. Do this for both deployments.

## 8. Test it

1. On the live site, submit a real booking with your own email/phone.
2. Confirm two emails arrive: one to `OWNER_EMAIL` ("NEW BOOKING REQUEST…"),
   one to the customer address ("We received your appointment request…").
3. Open your Deployment B (dashboard) URL while logged into `OWNER_EMAIL`.
   The request should appear under **Pending**.
4. Try **Accept**, **Propose Different Time**, and **Decline** on test
   bookings and confirm the right email goes out each time. For "Propose
   Different Time," the customer email includes a link to `respond.html` —
   open it and confirm you can pick a time and it flips the booking to
   Confirmed.
5. Check the **Calendar** and **Availability** tabs load correctly.

## Costs

$0. Google Sheets, Apps Script, and `MailApp` email sending are all free for
volumes far beyond what a local detailing business needs.

## SMS (optional, not built yet)

Apps Script can't send text messages on its own. `Emails.gs` has a
`sendSms_()` stub and a `CONFIG.SMS_ENABLED` flag (off by default) ready for
when you want to add it — that would mean creating a paid account with an
SMS provider (Twilio is the common choice: a few dollars/month for a phone
number plus a small per-message fee) and putting the provider call inside
`sendSms_()`. Email notifications work fully without this.

## Known limitation: photo uploads

The booking form's "Vehicle Photos" field is optional and still shows on
the site, but photos are **not** currently sent to the backend or attached
to notification emails — forwarding files through this pipeline would add
meaningful complexity (upload size limits, storage) for a field most
customers skip. If a customer uploads photos, ask them to text or email the
photos separately when you follow up.
