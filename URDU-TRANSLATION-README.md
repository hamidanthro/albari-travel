# Urdu Translation Infrastructure

Premium Pakistani Urdu (RTL, Noto Nastaliq) version of the site at `/ur/`.

## What's in place (as of 2026-06-25)

### Font
- **Noto Nastaliq Urdu** (variable, 239 KB woff2) self-hosted at `/fonts/noto-nastaliq-urdu.woff2`
- `@font-face` registered in `/fonts/fonts.css` with `unicode-range` restricted to Arabic-Urdu glyphs (Inter/Playfair handle Latin)
- Preloaded with `<link rel="preload" as="font" crossorigin>` on every Urdu page

### CSS
- All RTL rules scoped to `body[dir="rtl"]` in `css/main.css` — English site is unaffected
- Mirrored: header, nav, footer columns, breadcrumb arrows, left-border accents → right-border
- Floating WhatsApp button moves to bottom-LEFT in RTL
- Mobile bottom CTA buttons reverse order
- Form inputs align right; phone/email inputs stay LTR
- Nastaliq-aware line-heights (1.95 for body, 1.6 for headings)
- Slightly larger font sizes for body (1.05rem) since Nastaliq reads slower visually
- `.ltr` utility class for English brand names / phone numbers / URLs inside Urdu paragraphs

### URL structure
- Path-prefix model: `/ur/...` (NOT subdomain)
- Same domain → GitHub Pages works without extra DNS
- Same SEO/analytics property → no separate GSC setup needed
- Each EN page links to its UR equivalent via `<link rel="alternate" hreflang="ur">` (and vice versa)

### Language switcher
- Header partial at `templates/_partials/lang-switcher.html`
- Globe icon + language name button
- Sticky placement next to header CTA
- Already wired into the template-based pages
- Hardcoded into `index.html` + `404.html` (which use inline heads)

### hreflang tags
- Every page in the template-based system gets `<link rel="alternate" hreflang="en|ur|x-default">` tags
- Defaults are set in `render(ctx)` via `withDefaults()` — page-specific contexts can override

### Build system
- New target: `node scripts/build-pages.js urdu` (or runs as part of `all`)
- Source data: `data/ur/translations.json` (site-wide strings)
- Template: `templates/urdu-home.html` (homepage proof-of-concept)
- Output: `/ur/index.html`
- Sitemap entry at priority `0.9 weekly`

## How to translate a new page

The infrastructure is generic. To translate any existing English page (e.g. `/about/`) into Urdu:

### Step 1 — Extend the translations data
Add the page's strings to `data/ur/translations.json` under a new key:

```json
{
  "aboutPage": {
    "hero": "ہمارے بارے میں",
    "h1": "الباری ٹریول اینڈ ٹورز کے بارے میں",
    "intro": "..."
  }
}
```

### Step 2 — Create an RTL template
Either:
- **Option A (recommended):** Add `{{>lang-switcher}}` and an `{{altLangUrl}}` placeholder to the existing English template, then add a `_lang: 'ur'` flag to the build context for the Urdu copy. The shared template renders both languages with the appropriate translation map.
- **Option B (faster for one-off):** Copy the EN template, rename to `templates/urdu-<page>.html`, replace hardcoded English strings with `{{...}}` placeholders, set `<html lang="ur" dir="rtl">`.

For Phase 1 (homepage), Option B was used to keep the proof-of-concept simple. For Phase 2+ (about, services, etc.) Option A is recommended once the patterns settle.

### Step 3 — Add to the build function
In `scripts/build-pages.js#buildUrduPages()`, add:

```js
const aboutTpl = readTemplate('urdu-about.html');
const aboutCtx = {
  seoTitle: '...',
  seoDescription: t.brand.shortDescription,
  // ... all other vars
};
writeFile('ur/about/index.html', render(aboutTpl, aboutCtx));
```

### Step 4 — Add to sitemap
In `buildSitemap()`, add:
```js
{ loc: `${site.domain}/ur/about/`, priority: '0.7', changefreq: 'monthly', image: ogImage, imageTitle: '...' },
```

### Step 5 — Cross-link with hreflang
- The EN `/about/` page must link to UR via `<link rel="alternate" hreflang="ur" href=".../ur/about/">`
- The UR `/ur/about/` page must link back to EN via `<link rel="alternate" hreflang="en" href=".../about/">`
- Both already handled automatically by `render()` defaults — set `_lang: 'ur'` and `hreflangEnUrl: '/about/'` in the UR context, and `hreflangUrUrl: '/ur/about/'` in the EN context's `withDefaults()` override.

## Translation guidelines (Pakistani Urdu style)

- **Brand names stay Latin:** "Al Bari Travel & Tours" → "الباری ٹریول اینڈ ٹورز" (transliterated), but `<span class="ltr">Al Bari Travel & Tours</span>` is acceptable when needed
- **Numbers stay Western Arabic (0-9), NOT Eastern Arabic (٠١٢٣)** — Pakistani Urdu publications use Western digits, and the site uses them in phone numbers
- **Technical terms transliterate, not translate:** WhatsApp → واٹس ایپ, Visa → ویزا, Schengen → شینگن, MoFA → ایم او ایف اے, Trustpilot stays Latin
- **Phone numbers + emails stay LTR** — use `<span class="ltr">+92 315 9596161</span>`
- **Brand voice:** formal but warm (تہذیب-respectful), as Pakistani families expect from travel agency communications
- **Honorifics:** use respectful forms — "آپ" not "تم", مہمان not "گاہک" (guest, not customer)
- **Religious terminology:** honor specific Islamic terms — حج (Hajj), عمرہ (Umrah), احرام (Ihram), طواف (Tawaf), سعی (Sa'i), حلق (Halq)
- **Don't over-translate:** "WhatsApp +92 315 9596161" is more recognizable than "+92 315 9596161 پر واٹس ایپ کریں" in many places

## Roadmap (translation rollout)

Suggested order, prioritized by SEO + conversion impact:

| Priority | Page | Why |
|---|---|---|
| 1 | `/ur/` (homepage) | ✅ DONE |
| 2 | `/ur/services/hajj-and-umrah/` | Highest-volume Pakistani search intent |
| 3 | `/ur/contact/` | Conversion-critical |
| 4 | `/ur/about/` | E-E-A-T signal |
| 5 | `/ur/services/` (landing) | Sitemap parent |
| 6 | `/ur/services/airline-tickets/` | Massive volume |
| 7 | `/ur/services/visit-visas/` | High intent |
| 8 | `/ur/services/work-visas/` | Pakistani worker traffic |
| 9 | `/ur/services/student-visas/` | Growing Pakistani student market |
| 10 | `/ur/offices/` (landing) | Trust signal |
| 11 | `/ur/forms/` (landing) | SEO long-tail |
| 12 | `/ur/blog/` (landing) | SEO long-tail |
| 13 | Individual office + form + blog pages | Long-tail at scale |

After top 5 are translated, evaluate Google Search Console for Urdu queries — that data drives priorities 6-13.

## Files

| File | Purpose |
|---|---|
| `fonts/noto-nastaliq-urdu.woff2` | Self-hosted Nastaliq variable font (239 KB) |
| `fonts/fonts.css` | `@font-face` definitions including Nastaliq |
| `css/main.css` | RTL rules scoped to `body[dir="rtl"]` |
| `data/ur/translations.json` | Site-wide Urdu strings |
| `templates/urdu-home.html` | Homepage RTL template |
| `templates/_partials/lang-switcher.html` | Globe button (used in template-based pages) |
| `templates/_partials/head.html` | hreflang tags |
| `scripts/build-pages.js#buildUrduPages` | Build function (extend as more pages translate) |
| `ur/index.html` | Built output (do not edit; regenerate via build) |
| `URDU-TRANSLATION-README.md` | This file |

## Quick commands

```sh
# Build only Urdu pages
node scripts/build-pages.js urdu

# Build everything (recommended)
node scripts/build-pages.js all

# Check Urdu page renders without errors
curl -s http://localhost:8000/ur/ | head -30
```
