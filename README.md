# Southern Suds Mobile Detailing — Website

A modern, mobile-first website for a mobile auto-detailing business. Built with plain HTML5, modern CSS, and vanilla JavaScript — no build tools, frameworks, or paid plugins required.

## Files in This Project

| File | Purpose |
|---|---|
| `index.html` | All page content and structure (single page site with anchor-linked sections) |
| `styles.css` | All styling, including the color system, layout, and responsive rules |
| `script.js` | All interactivity (menu, accordion, sliders, form validation, modals) |
| `README.md` | This file |

---

## 1. How to Open the Website

No installation or server is required for local viewing:

1. Locate the folder containing `index.html`, `styles.css`, and `script.js` (they must stay in the same folder).
2. Double-click `index.html`. It will open in your default web browser.

For the best experience while editing (and to avoid occasional browser file-access restrictions on the photo upload field), you can also run a simple local server:

```bash
# From inside the project folder, using Python 3
python -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

---

## 2. How to Replace the Logo

The site now uses your real logo (the red/black/silver truck badge) throughout. Two copies of it live in `images/`:

- `images/Southern Suds Demo Red.png` — the original, full-resolution master file (1254×1254px), kept untouched in case you ever need the highest-quality version (print, merch, etc.).
- `images/logo.png` — a web-optimized copy (640×640px, resized only — never cropped, recolored, or redrawn) that every `<img>` tag on the site actually points to, so pages load faster.

**To swap in a different or updated logo file later:**

1. Replace `images/logo.png` with your new file (keep the filename the same, or update every `<img src="images/logo.png">` reference in `index.html` if you rename it — search for `images/logo.png` to find every usage: main nav, mobile nav, hero, footer, and the booking confirmation message).
2. Every logo placement uses the shared `.brand-logo` CSS class plus a sizing modifier, defined near the top of `styles.css` in the "LOGO / BRAND MARK" section:
   - `.brand-logo--nav` — desktop/mobile navigation (auto-shrinks at the mobile breakpoint)
   - `.brand-logo--hero` — the badge shown above the hero headline
   - `.brand-logo--footer` — footer brand mark
   - `.brand-logo--confirm` — shown in the booking confirmation message
3. If you ever need to place the logo on a **light** background, wrap it in `<div class="logo-card">...</div>` — this gives it a black card with a rounded border and a soft red glow so it still reads clearly (all current placements are already on dark backgrounds, so this isn't in use yet, but the class is ready).
4. Update the favicon and `og:image` meta tag (both in `<head>`) if you change the logo file — they currently also point to `images/logo.png`. Note that a highly detailed badge logo loses legibility at 16×16px browser-tab size; if that bothers you, crop a simplified square mark from the artwork and point the favicon `<link>` tags at that instead.

---

## 3. How to Replace Hero and Gallery Images

All placeholder imagery on this site is a set of **original SVG graphics** (gradient backgrounds with simple icon illustrations), not stock photography. They live in the `images/` folder and were designed to look intentional and on-brand even before you swap them out — but they should still be replaced with real photos of your actual work before publishing.

**Hero image** (`index.html`, inside `<section class="hero">`):
- Find the `<img class="hero-img" ...>` tag (search for `HERO IMAGE PLACEHOLDER`).
- Currently points to `images/hero-placeholder.svg`. Replace the `src` with your own photo, ideally **1920×1280px or larger**, compressed to under 300KB (WebP or optimized JPG recommended), e.g. `images/hero.jpg`.
- Update the `alt` text to describe your actual photo.

**Before/After gallery** (`index.html`, inside `<section id="results">`):
- There are six `.ba-slider` blocks, each with two images: an "after" image (`.ba-after`, shown as the full background) and a "before" image (`.ba-before`, revealed by the slider).
- Placeholder files currently live in `images/results/` (e.g. `interior-before.svg` / `interior-after.svg`). Replace each with your own photo using the same naming pattern (e.g. `interior-before.jpg` / `interior-after.jpg`) and update the `src` attributes to match.
- Update the matching `alt` text and `.ba-caption` text for each pair. Each card also has a `.ba-meta-line` (vehicle type + service performed) and a `.ba-summary` sentence — update those too so they describe your real photos instead of the placeholder scenario.
- Keep the two images in each pair at the same crop/aspect ratio (4:3) so the slider lines up correctly.
- Note: the "After" label sits on the left side of each slider and "Before" on the right — that matches how the slider mechanic is built (dragging right reveals the "after" image from the left edge). If you restructure the slider markup, double-check the label positions in `styles.css` (`.ba-label-before` / `.ba-label-after`) still match what's actually visible on each side.

**Owner/team photo** (`index.html`, inside `<section id="about">`):
- Search for `OWNER PHOTO PLACEHOLDER` and replace the `.photo-placeholder` div with an `<img>` tag, ideally a square photo at least 800×800px.

**Favicon** (`index.html`, `<head>`):
- Currently points to `images/logo.png` (your real logo). See Section 2 above for notes on legibility at small sizes.

**Replace every placeholder image before publishing** so the site reflects your actual work.

---

## 4. How to Change Colors

All colors are defined as CSS custom properties at the top of `styles.css`, inside the `:root { ... }` block (Section 1: CSS VARIABLES). The palette matches the red/black/silver logo:

```css
--color-primary: #ef1b1b;        /* primary brand red */
--color-primary-bright: #ff3131; /* bright neon red — hover states, glows */
--color-primary-dark: #9f0909;   /* deep red — gradients */
--color-black: #050505;          /* near-black background */
--color-charcoal: #111111;       /* dark section background */
--color-dark-gray: #1c1c1c;      /* card/surface background */
--color-silver: #c9c9c9;         /* silver accent */
--color-white: #ffffff;
```

Changing these values updates the color everywhere they're used — buttons, gradients, borders, glows, icons, etc. — because the rest of the stylesheet references semantic tokens (`--accent`, `--gradient-primary`, `--shadow-primary`, `--glow-primary`, and so on) that are built from these base colors rather than hard-coded hex values.

**Neon hover/glow effects:** buttons (`.btn`), package/service/benefit/review/plan cards, and the before/after gallery all get a red glow and border highlight on hover — driven by the same variables above, plus a `--glow-primary` shadow token. If you change `--color-primary-bright`, every glow effect on the site updates with it.

---

## 5. How to Update Package Prices

Prices are shown as firm, exact figures — not ranges or "starting at" estimates. Each package is an `<article class="package-card">` inside `<section id="packages">` in `index.html`; the price is in `<p class="package-price">$XXX</p>`. Update the number there to change what's displayed, and check the booking form's "Selected Package" dropdown and any other page referencing the same package to keep them in sync.

---

## 6. How to Update Service Areas

The service area is already set to **Houston, TX** as the primary area, with 20 surrounding cities listed as secondary areas (Katy, Cypress, Sugar Land, Pearland, Pasadena, Missouri City, Richmond, Rosenberg, Spring, Tomball, The Woodlands, Humble, Jersey Village, Bellaire, West University Place, Friendswood, League City, Baytown, Deer Park, and Stafford). This appears in five places that need to stay in sync if you change it:

1. The Service Area section (`<section id="service-area">`) — the primary-area line and the `.area-list` of secondary cities.
2. The FAQ answer to "What areas do you serve?"
3. The footer's "Serving Houston & Surrounding Areas" tagline.
4. The booking form's "City / Service Area" dropdown (`<select id="service-city">`) — includes an "Other / Not Listed" option so customers outside the list can still book via the free-text address field.
5. The `areaServed` array inside the `<script type="application/ld+json">` structured data block in the `<head>`.

Also update the travel-fee disclaimer text near the service area list if you want to specify an actual mileage radius or fee.

The Google Map embed near the service area list is centered on Houston, TX using the no-API-key `maps.google.com/maps?q=...&output=embed` format. If you move your primary service area, update the `q=` parameter in that iframe's `src`. See the comment above the `<iframe>` in `index.html` for how to upgrade to a styled Google Maps Embed API version if you want more control over its appearance.

---

## 7. How to Add the Phone Number and Email

The phone number is already set site-wide to **(713) 269-1708**, linked as `tel:+17132691708` for click-to-call and `sms:+17132691708` for click-to-text, across the nav, hero, mobile action bar, footer, Contact section, booking confirmation, contact links, and structured data.

The email is already set site-wide to **southernsudsmd@gmail.com**, linked as `mailto:southernsudsmd@gmail.com` in the footer, the Contact section, the booking section's direct-contact links, and the structured data block.

To change either later, search the project for the phone/email string (both the link `href` value and the visible text) and replace every instance consistently. Use your code editor's "Find in Files" (or a batch search/replace) across `index.html` to catch every instance quickly.

---

## 8. How the Booking System Works

The booking form in `index.html` (`<form id="booking-form">`) submits to a
Google Sheets + Google Apps Script backend — no Supabase, no paid database,
no server to maintain. Every request starts as **Pending** until you
personally accept, propose a different time, or decline it from a private
owner dashboard; nothing is ever auto-confirmed.

- **Setup (one-time, required):** see [`BOOKING-SYSTEM-SETUP.md`](BOOKING-SYSTEM-SETUP.md).
  Until you complete it and paste your Web App URL into `window.BOOKING_API_URL`
  at the top of `script.js`, the form will show a friendly "not fully set up
  yet, please call/text us" message instead of failing silently.
- **Backend source:** [`google-apps-script/`](google-apps-script/) — copy
  these files into the Apps Script editor as described in the setup guide.
- **Owner dashboard:** a private URL (not linked anywhere on the public
  site) that only opens for the one Google account you configure as
  `OWNER_EMAIL`. From it you can accept, propose alternate times, decline,
  mark jobs completed, cancel, contact the customer, view a calendar of
  confirmed appointments, and manage business hours / blocked dates.
- **Customer alternate-time selection:** [`respond.html`](respond.html) — a
  page on this site customers land on from an emailed link when you propose
  different times.

---

## 9. How to Add Google Reviews

The Reviews section (`index.html`, `<section id="reviews">`) currently contains clearly labeled placeholders ("Add a verified customer review here.") instead of invented testimonials.

To add real reviews:
1. Copy the exact review text and reviewer's first name/initial from Google (with their permission, and only if they left the review publicly), and replace the placeholder text and name in each `.review-card`.
2. Replace `[GOOGLE REVIEW LINK]` (in the "Read Our Google Reviews" button) with your actual Google Business Profile review link.
3. If you'd rather embed live reviews automatically, consider a third-party review widget (e.g. from your Google Business Profile management tool) and swap the `.review-grid` markup for that embed.

Do not fabricate names, star ratings, or review counts, and do not add rating values to the structured data unless they are real and verifiable.

---

## 10. How to Connect a Custom Domain

Once your site is published on a host (see Section 11):

- **Netlify:** Site settings → Domain management → Add custom domain → follow the DNS instructions (usually a CNAME or Netlify DNS delegation).
- **Vercel:** Project → Settings → Domains → Add your domain → follow the DNS instructions (A record or CNAME).
- **GitHub Pages:** Repository → Settings → Pages → add your custom domain, then create a `CNAME` file in the repo root with your domain name, and configure your DNS provider with the A records or CNAME GitHub provides.

After connecting a domain, update:
- `[CANONICAL URL]` in the `<link rel="canonical">` tag and Open Graph tags in `index.html`.
- The `url` field in the structured data (`application/ld+json`) block.

---

## 11. How to Publish

### GitHub Pages
1. Create a new GitHub repository and push `index.html`, `terms.html`, `respond.html`, `styles.css`, `script.js`, plus your `images/` folder. (The `google-apps-script/` folder is backend source for Apps Script, not part of the published site — you don't need to publish it.)
2. Go to Settings → Pages, set the source branch (usually `main`) and folder (`/root`), and save.
3. Your site will be live at `https://<username>.github.io/<repo-name>/`.

### Netlify
1. Drag and drop the project folder into the Netlify dashboard ("Deploys" → "Deploy manually"), or connect your GitHub repository for automatic deploys.
2. Netlify will detect it as a static site automatically — no build command is needed.

### Vercel
1. Import the project from GitHub (or use the Vercel CLI: `vercel` from inside the project folder).
2. Framework preset: choose "Other" / static — no build command is required.

---

## 12. Placeholders Checklist — Update Before Publishing

**Already filled in:**

- [x] Phone number — `(713) 269-1708` / `tel:+17132691708` / `sms:+17132691708`, used consistently across nav, hero, mobile action bar, footer, booking confirmation, contact links, and structured data.
- [x] Service area — primary area (Houston, TX) and 20 surrounding cities (Katy, Cypress, Sugar Land, Pearland, Pasadena, Missouri City, Richmond, Rosenberg, Spring, Tomball, The Woodlands, Humble, Jersey Village, Bellaire, West University Place, Friendswood, League City, Baytown, Deer Park, Stafford), reflected in the Service Area section, FAQ, footer, booking form's City dropdown, and structured data `areaServed`.
- [x] Google Map — embedded, centered on Houston, TX (see the note in `index.html` near the map for how to upgrade to a styled Maps Embed API version later).
- [x] Email — `southernsudsmd@gmail.com` / `mailto:southernsudsmd@gmail.com`, used consistently across the footer, the dedicated Contact section, booking section direct-contact links, and structured data.
- [x] Business hours — Monday–Sunday, 8:00 AM–5:00 PM, reflected in the footer, the Contact section, and structured data `openingHoursSpecification`.

**Still need your input** — search the project for each bracketed token:

- [ ] `[BOOKING LINK]` — if you use an external booking platform
- [ ] `[GOOGLE REVIEW LINK]` — Reviews section button
- [ ] `[INSTAGRAM LINK]`, `[FACEBOOK LINK]` — footer social icons and the "See More Results on Instagram" button
- [ ] `[CANONICAL URL]` — `<head>` meta tags and structured data
- [ ] `[LOGO OR HERO IMAGE URL]` — structured data `image` field (can point to `images/logo.png`)
- [ ] A street-level business address and ZIP code were intentionally left out of the structured data — mobile businesses often don't have one to publish. Add `postalCode`/`streetAddress` to the `address` object in `index.html` only if you have a real one you want listed.
- [ ] Hero image, all 6 before/after gallery image pairs, owner photo (Section 3 above)
- [ ] FAQ answers marked `[EDITABLE: ...]` — confirm your actual policies (water/electricity access, presence required, weather rescheduling, payment methods, preparation instructions, apartment/workplace access, cancellation window)
- [ ] Legal modal content (Privacy Policy, Terms and Conditions, Cancellation Policy) — currently placeholder text; replace with reviewed policies, ideally checked by a professional
- [ ] Booking form backend connection (Section 8 above)
- [ ] Real customer reviews (Section 9 above)

---

## Notes on Design Decisions

- **No unverifiable claims:** the site intentionally avoids words like "licensed," "insured," "certified," "award-winning," or "five-star rated," and does not promise complete removal of every stain, scratch, or odor. Add these claims only once you can verify and stand behind them.
- **Accessibility:** semantic landmarks, labeled form fields, visible focus states, keyboard-operable accordion/menu/modals, and `prefers-reduced-motion` support are built in. Please re-test with a keyboard and/or screen reader after making content changes.
- **Performance:** the site uses no external JS frameworks, lazy-loads below-the-fold images, and relies on native browser features (smooth scroll, `IntersectionObserver`) rather than animation libraries.
