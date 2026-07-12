#!/usr/bin/env node
/**
 * build-pages.js — data-driven page generator for albaritravelspk.com
 *
 * Reads templates from /templates and data from /data, writes static HTML to
 * the right destination paths. Zero dependencies (Node ≥ 16).
 *
 * Usage:
 *   node scripts/build-pages.js          # build everything
 *   node scripts/build-pages.js offices  # build only the offices section
 *
 * To add a new office: edit /data/offices.json, run this script, commit, push.
 * To add a new page TYPE (e.g. /packages/<slug>/): add a template + a data file
 * + a builder function below, mirror the offices pattern.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const DATA = path.join(ROOT, 'data');

const site = readJson('site.json');
const offices = readJson('offices.json').offices;
const provinces = readJson('districts.json').provinces;
const services = readJson('services.json').services;
const blog = readJson('blog.json');
const officesBySlug = Object.fromEntries(offices.map(o => [o.slug, o]));

// ------------------------------------------------------------------
// Tiny template engine
// ------------------------------------------------------------------
// Supports:
//   {{var}}        — escape-by-default substitution
//   {{{var}}}      — raw substitution (no escape)
//   {{>partial}}   — include a partial from templates/_partials/<name>.html
// Missing vars throw — fail loud, not silent.

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES, name), 'utf8');
}

function readPartial(name) {
  return fs.readFileSync(path.join(TEMPLATES, '_partials', `${name}.html`), 'utf8');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Pages that have an Urdu translation — keep in sync with buildUrduPages().
// Maps an EN path (e.g. "/about/") to its UR equivalent ("/ur/about/").
const UR_TRANSLATED = {
  '/': '/ur/',
  '/about/': '/ur/about/',
  '/contact/': '/ur/contact/',
  '/services/': '/ur/services/',
  '/services/hajj-and-umrah/': '/ur/services/hajj-and-umrah/',
  '/offices/': '/ur/offices/',
  '/blog/': '/ur/blog/',
  '/forms/': '/ur/forms/',
};

function urEquivalentFor(canonical) {
  if (!canonical) return null;
  // Strip the domain to get the path
  const m = String(canonical).match(/^https?:\/\/[^\/]+(\/.*)$/);
  if (!m) return null;
  const path = m[1];
  return UR_TRANSLATED[path] || null;
}

// Defaults injected into every render context — for keys that are
// optional and should not throw on missing. Add to this map as new
// optional template vars are introduced.
function withDefaults(ctx) {
  const isUr = ctx && ctx._lang === 'ur';
  // For EN pages: detect if a UR translation exists for this canonical URL
  const urPath = isUr ? null : urEquivalentFor(ctx && ctx.canonical);
  const enPath = (ctx && ctx.canonical && isUr) ? (ctx.canonical.replace('/ur/', '/').replace(/^https?:\/\/[^\/]+/, '')) : '/';
  return {
    // Language-switcher defaults — EN pages point to UR translation if it
    // exists, otherwise fall back to UR homepage. UR pages point back to EN.
    altLangUrl: isUr ? enPath : (urPath || '/ur/'),
    altLangCode: isUr ? 'en' : 'ur',
    altLangLabel: isUr ? 'English' : 'اردو',
    // hreflang head metadata: emit only when there IS a UR translation
    hreflangEnUrl: isUr ? enPath : '/',
    hreflangUrUrl: isUr ? '/ur/' : (urPath || '/ur/'),
    htmlLang: isUr ? 'ur' : 'en',
    htmlDir: isUr ? 'rtl' : 'ltr',
    bodyClass: isUr ? 'ur-body' : '',
    // Email signup defaults (override per-page for context-specific signups)
    emailSignupTag: isUr ? 'مفت سفری مشورے' : 'Free travel tips',
    emailSignupHeading: isUr ? 'پاکستانی مسافروں کے لیے مفت ماہانہ مشورے' : 'Monthly travel tips for Pakistani families',
    emailSignupSub: isUr ? 'ہر مہینے ایک ای میل میں عمرہ، حج، ویزا اور پروازوں پر تازہ ترین تجاویز۔ کوئی سپام نہیں — جب چاہیں ان سبسکرائب کریں۔' : 'One email a month with practical Umrah, Hajj, visa, and flight tips — written by our Regional Reps for Pakistani families. No spam, unsubscribe any time.',
    emailSignupListName: 'monthly-tips',
    emailSignupBtnText: isUr ? 'سبسکرائب کریں' : 'Subscribe',
    emailSignupAutoreply: isUr ? 'شکریہ سبسکرپشن کے لیے۔ پہلا ای میل اگلے ماہ کے شروع میں۔ کوئی سوال؟ واٹس ایپ کریں +92 315 9596161۔' : 'Thanks for subscribing! Your first email arrives at the start of next month. Any questions? WhatsApp +92 315 9596161.',
    emailSignupFinePrint: isUr ? 'ہم آپ کی ای میل صرف ماہانہ تجاویز کے لیے استعمال کریں گے۔ کبھی کسی تیسرے فریق کو فروخت نہیں۔' : 'We only use your email for the monthly tips. Never sold to third parties.',
    ...ctx,
  };
}

function render(tpl, ctx) {
  ctx = withDefaults(ctx || {});
  // Inline partials, recursively — a partial may itself contain {{>otherPartial}}.
  // Loop until no more {{>...}} patterns remain (with safety bound to avoid infinite recursion).
  let out = tpl;
  for (let i = 0; i < 8; i++) {
    if (!/\{\{>\s*[\w-]+\s*\}\}/.test(out)) break;
    out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => readPartial(name));
  }
  // Raw substitution ({{{var}}})
  out = out.replace(/\{\{\{\s*([\w-]+)\s*\}\}\}/g, (_, key) => {
    if (!(key in ctx)) throw new Error(`Missing template var: ${key}`);
    return String(ctx[key]);
  });
  // Escaped substitution ({{var}})
  out = out.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, key) => {
    if (!(key in ctx)) throw new Error(`Missing template var: ${key}`);
    return escapeHtml(ctx[key]);
  });
  return out;
}

function writeFile(rel, content) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  console.log(`  wrote ${rel}  (${content.length} bytes)`);
}

// ------------------------------------------------------------------
// Office page builders
// ------------------------------------------------------------------

function officeCardHtml(office) {
  return `        <a class="office-card-link" href="/offices/${office.slug}/" aria-label="View ${office.name}">
            <article class="office-card-static">
                <span class="office-city">${escapeHtml(office.country)}</span>
                <h3>${escapeHtml(office.name)}</h3>
                <p class="office-card-meta">${escapeHtml(office.city)}, ${escapeHtml(office.country)} · ${escapeHtml(office.incharge)}</p>
                <p class="office-card-meta">${escapeHtml(office.phoneDisplay)}</p>
                <span class="office-card-cta">View office &rarr;</span>
            </article>
        </a>`;
}

function ctaButtonsHtml(office) {
  const buttons = [];
  if (office.hasWhatsapp) {
    buttons.push(`<a href="https://wa.me/${office.whatsappNumber}" target="_blank" rel="noopener" class="btn btn-primary">WhatsApp</a>`);
  }
  buttons.push(`<a href="tel:${office.phoneE164}" class="btn ${office.hasWhatsapp ? 'btn-secondary' : 'btn-primary'}">Call ${escapeHtml(office.incharge.split(' ')[0])}</a>`);
  if (!office.hasWhatsapp) {
    buttons.push(`<a href="sms:${office.phoneE164}" class="btn btn-secondary">Text</a>`);
  }
  return buttons.map(b => '                    ' + b).join('\n');
}

function serviceListHtml(office) {
  return office.services.map(s => `                <li>${escapeHtml(s)}</li>`).join('\n');
}

function footerOfficeListHtml() {
  return offices.map(o =>
    `                <li><a href="/offices/${o.slug}/" style="color:#fff;opacity:0.8;text-decoration:none;">${escapeHtml(o.city)}, ${escapeHtml(o.country)}</a></li>`
  ).join('\n');
}

// ------------------------------------------------------------------
// Province + district builders
// ------------------------------------------------------------------

function provinceCardHtml(province) {
  const repCount = (province.regionalRepSlugs || []).length;
  const repLine = repCount > 0
    ? `<p class="office-card-meta"><strong>${repCount} regional representative${repCount > 1 ? 's' : ''}</strong> &middot; ${province.districts.length} ${province.districts.length === 1 ? 'district' : 'districts'} served</p>`
    : `<p class="office-card-meta"><strong>${province.districts.length} ${province.districts.length === 1 ? 'district' : 'districts'}</strong> served by our remote agent network</p>`;
  return `        <a class="office-card-link province-card-link" href="/offices/${province.slug}/" aria-label="View ${province.name} offices">
            <article class="office-card-static province-card-static">
                <span class="office-city">${escapeHtml(province.country)}</span>
                <h3>${escapeHtml(province.name)} Offices</h3>
                <p class="office-card-meta">${escapeHtml(province.tagline)}</p>
                ${repLine}
                <span class="office-card-cta">Explore ${escapeHtml(province.name)} &rarr;</span>
            </article>
        </a>`;
}

function districtCardHtml(province, district) {
  const href = district.linkedOfficeSlug
    ? `/offices/${district.linkedOfficeSlug}/`
    : `/offices/${province.slug}/${district.slug}/`;
  const badge = district.linkedOfficeSlug ? 'Active office' : 'Branch network';
  const cardClass = district.linkedOfficeSlug ? 'district-card is-active-office' : 'district-card';
  return `        <a class="district-card-link" href="${href}" aria-label="View Al Bari Travel and Tours ${escapeHtml(district.name)} contact details">
            <article class="${cardClass}">
                <span class="district-card-badge">${badge}</span>
                <h3>${escapeHtml(district.name)}</h3>
                <span class="district-card-cta">View ${escapeHtml(district.name)} &rarr;</span>
            </article>
        </a>`;
}

function buildProvincePage(province) {
  const tpl = readTemplate('province.html');
  const repSlugs = new Set(province.regionalRepSlugs || []);
  const reps = [...repSlugs].map(slug => officesBySlug[slug]).filter(Boolean);

  // Districts shown below: skip those whose linkedOfficeSlug matches a named rep
  // (avoids the same representative appearing twice on one page).
  const districts = province.districts.filter(d => !repSlugs.has(d.linkedOfficeSlug));

  const walkInSection = reps.length > 0 ? `
<section class="packages" style="padding-bottom:40px;">
    <div class="section-header" style="margin-bottom:30px;">
        <p class="section-tag">Named Regional Representatives</p>
        <h2 style="font-size:1.8rem;">Direct Contacts in ${escapeHtml(province.name)}</h2>
        <p>${reps.length} dedicated Regional Representative${reps.length > 1 ? 's' : ''} serving clients across ${escapeHtml(province.name)}. Reach any of them directly by phone or WhatsApp.</p>
    </div>
    <div class="offices-grid">
${reps.map(officeCardHtml).join('\n')}
    </div>
</section>` : '';

  const ctx = {
    name: province.name,
    country: province.country,
    tagline: province.tagline,
    districtCount: String(districts.length),
    canonical: `${site.domain}/offices/${province.slug}/`,
    seoTitle: province.seoTitle,
    seoDescription: province.seoDescription,
    ogType: 'website',
    walkInSection,
    districtCards: districts.map(d => districtCardHtml(province, d)).join('\n'),
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile(`offices/${province.slug}/index.html`, render(tpl, ctx));
}

// Deterministic hash → integer (so a given district always picks the same template).
function hashSlug(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// =====================================================================
// Date helpers — DO NOT hardcode years in copy. Use these.
//
// Build-time computation means a re-run of `node scripts/build-pages.js`
// keeps everything current. Years drift as follows:
//   - Hajj 2026 = May 25-30, 2026
//   - Hajj 2027 = May 14-19, 2027
//   - Hajj 2028 = May 4-9, 2028  (then April from 2029+ as it walks back)
// Cutoff rule: month >= July → upcoming Hajj is next Gregorian year.
// This is safe for the next 10+ years because Hajj keeps moving earlier.
//
// To refresh dates: `cd albari-travel && node scripts/build-pages.js`
// then commit. Consider scheduling this via GitHub Actions monthly.
// =====================================================================
function currentYear() {
  return new Date().getFullYear();
}
function upcomingHajjYear() {
  const now = new Date();
  // Cutoff = June 1. Before June: this year's Hajj is still upcoming.
  // From June onwards: this year's Hajj has passed, upcoming is next year.
  // Edge case: Hajj migrates ~11 days earlier each Gregorian year. From 2028+
  // Hajj ends in early May / late April. There's a ~10-day window after Hajj
  // ends but before June 1 where this rule lags by one year. Manually override
  // the HAJJ_YEAR const if that matters during a build window.
  return now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
}
const HAJJ_YEAR = upcomingHajjYear();
const CURRENT_YEAR = currentYear();
console.log(`  context: currentYear=${CURRENT_YEAR}, upcomingHajjYear=${HAJJ_YEAR}`);

// Nearest international airport per district — meaningful entity signal for SEO + real
// info for the user. Mapping is by region + a few district overrides for major hubs.
// Airport code -> full name. Real commercial/international airports in Pakistan.
const AIRPORTS = {
  ISB: 'Islamabad International Airport',
  LHE: 'Allama Iqbal International Airport, Lahore',
  SKT: 'Sialkot International Airport',
  LYP: 'Faisalabad International Airport',
  MUX: 'Multan International Airport',
  BHV: 'Bahawalpur Airport',
  RYK: 'Sheikh Zayed International Airport, Rahim Yar Khan',
  DEA: 'Dera Ghazi Khan International Airport',
  KHI: 'Jinnah International Airport, Karachi',
  WNS: 'Nawabshah Airport',
  SKZ: 'Sukkur Airport',
  PEW: 'Bacha Khan International Airport, Peshawar',
  SDT: 'Saidu Sharif Airport, Swat',
  CJL: 'Chitral Airport',
  DSK: 'Dera Ismail Khan Airport',
  BNP: 'Bannu Airport',
  UET: 'Quetta International Airport',
  PZH: 'Zhob Airport',
  GWD: 'Gwadar International Airport',
  TUK: 'Turbat International Airport',
  PJG: 'Panjgur Airport',
  DBA: 'Dalbandin Airport',
  GIL: 'Gilgit Airport',
  KDU: 'Skardu International Airport',
  IAH: 'George Bush Intercontinental Airport, Houston',
};

// Accurate nearest-airport per district (by real geography, not province default).
// This is the primary genuine differentiator across the coverage pages: the airport,
// route, and flight content now vary district-to-district instead of one-per-province.
const DISTRICT_AIRPORT = {
  // --- Punjab ---
  lahore:'LHE', kasur:'LHE', sheikhupura:'LHE', 'nankana-sahib':'LHE', okara:'LHE',
  sialkot:'SKT', narowal:'SKT', gujranwala:'SKT', gujrat:'SKT', wazirabad:'SKT', hafizabad:'SKT', 'mandi-bahauddin':'SKT',
  faisalabad:'LYP', chiniot:'LYP', 'toba-tek-singh':'LYP', jhang:'LYP', sargodha:'LYP',
  multan:'MUX', khanewal:'MUX', lodhran:'MUX', vehari:'MUX', sahiwal:'MUX', pakpattan:'MUX', muzaffargarh:'MUX', layyah:'MUX', 'kot-addu':'MUX', taunsa:'MUX',
  bahawalpur:'BHV', bahawalnagar:'BHV',
  'rahim-yar-khan':'RYK',
  'dera-ghazi-khan':'DEA', rajanpur:'DEA',
  attock:'ISB', chakwal:'ISB', jhelum:'ISB', talagang:'ISB', murree:'ISB', mianwali:'ISB', khushab:'ISB', bhakkar:'ISB',
  // --- Sindh ---
  'karachi-central':'KHI','karachi-east':'KHI','karachi-south':'KHI','karachi-west':'KHI', malir:'KHI', korangi:'KHI', kemari:'KHI',
  thatta:'KHI', sujawal:'KHI', badin:'KHI', jamshoro:'KHI', hyderabad:'KHI', matiari:'KHI', 'tando-allahyar':'KHI', 'tando-muhammad-khan':'KHI',
  'mirpur-khas':'KHI', umerkot:'KHI', tharparkar:'KHI', sanghar:'KHI', dadu:'KHI',
  'shaheed-benazirabad':'WNS', 'naushahro-feroze':'WNS',
  sukkur:'SKZ', ghotki:'SKZ', khairpur:'SKZ', shikarpur:'SKZ', jacobabad:'SKZ', kashmore:'SKZ', larkana:'SKZ', 'qambar-shahdadkot':'SKZ',
  // --- Khyber Pakhtunkhwa ---
  peshawar:'PEW', charsadda:'PEW', nowshera:'PEW', mardan:'PEW', swabi:'PEW', mohmand:'PEW', khyber:'PEW', kohat:'PEW', hangu:'PEW', orakzai:'PEW', kurram:'PEW', 'central-kurram':'PEW', bajaur:'PEW', malakand:'PEW', buner:'PEW', shangla:'PEW', 'lower-dir':'PEW', 'upper-dir':'PEW', karak:'PEW',
  abbottabad:'ISB', haripur:'ISB', mansehra:'ISB', battagram:'ISB', 'tor-ghar':'ISB', 'upper-kohistan':'ISB', 'lower-kohistan':'ISB', 'kolai-palas':'ISB',
  swat:'SDT', 'lower-chitral':'CJL', 'upper-chitral':'CJL',
  'dera-ismail-khan':'DSK', tank:'DSK', 'upper-south-waziristan':'DSK', 'lower-south-waziristan':'DSK', 'lakki-marwat':'DSK',
  bannu:'BNP', 'north-waziristan':'BNP',
  // --- Balochistan ---
  quetta:'UET', pishin:'UET', 'killa-abdullah':'UET', chaman:'UET', mastung:'UET', kalat:'UET', nushki:'UET', ziarat:'UET', sibi:'UET', harnai:'UET', duki:'UET', loralai:'UET', musakhel:'UET', barkhan:'UET', kohlu:'UET', 'dera-bugti':'UET', 'killa-saifullah':'UET', surab:'UET', khuzdar:'UET',
  zhob:'PZH', sherani:'PZH',
  gwadar:'GWD', kech:'TUK', awaran:'TUK',
  panjgur:'PJG', washuk:'PJG',
  chagai:'DBA', kharan:'DBA',
  nasirabad:'SKZ', jafarabad:'SKZ', 'jhal-magsi':'SKZ', 'usta-muhammad':'SKZ', sohbatpur:'SKZ', kachhi:'SKZ', lehri:'SKZ',
  hub:'KHI', lasbela:'KHI',
  // --- Azad Kashmir (Islamabad is the international gateway) ---
  muzaffarabad:'ISB', bagh:'ISB', poonch:'ISB', haveli:'ISB', sudhanoti:'ISB', neelum:'ISB', 'hattian-bala':'ISB', kotli:'ISB', mirpur:'SKT', bhimber:'SKT',
  // --- Gilgit-Baltistan ---
  gilgit:'GIL', ghizer:'GIL', nagar:'GIL', hunza:'GIL', diamer:'GIL', astore:'GIL', 'gupis-yasin':'GIL', darel:'GIL', tangir:'GIL', roundu:'GIL',
  skardu:'KDU', shigar:'KDU', kharmang:'KDU', ghanche:'KDU',
};

// Which airports run direct international/Umrah service, and where domestic-only
// airports connect for Saudi Arabia. Real, useful info that varies per district.
const INTL_GATEWAYS = new Set(['ISB','LHE','KHI','MUX','SKT','PEW','UET','LYP','BHV','RYK','GWD','IAH']);
const DOMESTIC_HUB = {
  DEA:'MUX', WNS:'KHI', SKZ:'KHI', SDT:'ISB', CJL:'ISB', DSK:'ISB', BNP:'ISB',
  PZH:'UET', TUK:'KHI', PJG:'KHI', DBA:'KHI', GIL:'ISB', KDU:'ISB',
};

// A factual, per-district sentence about how pilgrims actually reach Saudi Arabia
// from their nearest airport. Direct-gateway vs domestic-connection is real and varies.
function routeNote(air) {
  if (INTL_GATEWAYS.has(air.code)) {
    return `${air.name} (${air.code}) offers international departures, so pilgrims can fly toward Jeddah (JED) or Madinah (MED) directly or with a single stopover.`;
  }
  const hub = DOMESTIC_HUB[air.code] || 'ISB';
  return `${air.name} (${air.code}) primarily handles domestic flights, so most pilgrims connect through ${AIRPORTS[hub]} (${hub}) for the onward flight to Jeddah (JED) or Madinah (MED) — a routing we book end-to-end.`;
}

function nearestAirport(province, district) {
  const code = DISTRICT_AIRPORT[district.slug];
  let picked;
  if (code && AIRPORTS[code]) picked = { code, name: AIRPORTS[code] };
  else {
    // Province-level fallback for any district not explicitly mapped above.
    const defaults = {
      'punjab': 'ISB', 'sindh': 'KHI', 'khyber-pakhtunkhwa': 'PEW', 'balochistan': 'UET',
      'islamabad': 'ISB', 'azad-kashmir': 'ISB', 'gilgit-baltistan': 'GIL', 'united-states': 'IAH',
    };
    const fb = defaults[province.slug] || 'ISB';
    picked = { code: fb, name: AIRPORTS[fb] };
  }
  picked.route = routeNote(picked);
  return picked;
}

function buildDistrictPage(province, district) {
  if (district.linkedOfficeSlug) return; // real office already has its own page
  const tpl = readTemplate('district.html');
  const bm = site.defaultBranchManager;
  const airportInfo = nearestAirport(province, district);
  const ctaButtons = [];
  if (bm.hasWhatsapp) {
    ctaButtons.push(`<a href="https://wa.me/${bm.whatsappNumber}" target="_blank" rel="noopener" class="btn btn-primary">WhatsApp ${escapeHtml(bm.incharge.split(' ')[0])}</a>`);
  }
  ctaButtons.push(`<a href="tel:${bm.phoneE164}" class="btn ${bm.hasWhatsapp ? 'btn-secondary' : 'btn-primary'}">Call ${escapeHtml(bm.incharge.split(' ')[0])}</a>`);

  // Rotate intro text by district to reduce duplicate-content footprint across 166 pages.
  // Each variant front-loads the Umrah/Hajj keyword, names a real entity (airport, regional hub,
  // Makkah/Madinah), and includes the named branch manager — that's entity-rich for Google
  // and useful for real users.
  const introTemplates = [
    `Book Umrah and Hajj packages from ${district.name}, ${province.name} with Al Bari Travel & Tours. We coordinate flights from ${airportInfo.name} (${airportInfo.code}) to Saudi Arabia (Makkah and Madinah), full Saudi visa processing, hotel accommodation near the Haram, and group departures. Your dedicated contact for ${district.name} is ${bm.incharge}, ${bm.title}, reachable directly by phone or WhatsApp.`,
    `Planning Umrah, Hajj, or an international flight from ${district.name}? Al Bari Travel & Tours coordinates the entire trip — package selection, Saudi visa, ticketing on PIA / Saudi Airlines / Air Sial, hotel near Masjid al-Haram, and ground transport between Makkah and Madinah — through ${bm.title} ${bm.incharge}. Nearest departure hub: ${airportInfo.name} (${airportInfo.code}).`,
    `Pilgrims and travellers in ${district.name}, ${province.name} have a direct line to Al Bari Travel & Tours via ${bm.incharge}, our ${bm.title}. Reach out for Umrah and Hajj packages, Saudi Arabia visa documentation, flight booking, and group departure coordination — all handled remotely by phone and WhatsApp. ${airportInfo.route}`,
    `For families and individuals in ${district.name} planning Umrah, Hajj ${HAJJ_YEAR}, or international travel, Al Bari Travel & Tours offers complete branch-network service. ${bm.incharge} (${bm.title}) handles enquiries personally from our ${bm.regionalHubLocation} hub — package quotes, Saudi visa applications, flights, and hotel bookings in Makkah and Madinah. ${airportInfo.route}`,
  ];
  const intro = introTemplates[hashSlug(district.slug) % introTemplates.length];

  // Per-district FAQ — pool of 14 entity-rich questions, deterministically pick 4 unique
  // per district by slug hash. Wider pool means each pair of district pages shares few/zero
  // questions — strong defense against duplicate-content penalties.
  const faqPool = [
    { q: `How do I book Umrah or Hajj from ${district.name}?`, a: `Call or WhatsApp ${bm.incharge}, our ${bm.title}, at ${bm.phoneDisplay}. We handle every step — package selection, Saudi visa, flights from ${airportInfo.name} (${airportInfo.code}), and group departure logistics — for clients in ${district.name} without requiring you to visit in person.` },
    { q: `Does Al Bari Travel have an office I can visit in ${district.name}?`, a: `Al Bari Travel operates as a remote service for ${district.name} clients. Your dedicated contact, ${bm.incharge} (${bm.title}), handles the entire booking by phone, WhatsApp, and email — no in-person visit needed. This is how all 170 districts of Pakistan are served.` },
    { q: `Can I get international flights booked from ${district.name}?`, a: `Yes. Al Bari Travel & Tours books international flights from ${airportInfo.name} (${airportInfo.code}) and other major Pakistani airports for clients across ${district.name} and the wider ${province.name} region — including Saudi Arabia, UAE, and other destinations. We work with PIA, Saudi Airlines, Air Sial, and other carriers. Ticket delivery is digital.` },
    { q: `What documents are needed for a Saudi visa from ${district.name}?`, a: `For Umrah and Hajj from ${district.name} we typically need: a valid passport (6+ months), recent photos, NIC copy, and travel proof. Our Saudi visa processing handles the rest — application, fees, and tracking. Call ${bm.phoneDisplay} for the current checklist.` },
    { q: `How long does it take to confirm an Umrah package booking from ${district.name}?`, a: `For ${district.name} clients, package quotation typically arrives within 1-2 hours of your first call or WhatsApp message. Once you confirm the dates and package tier, ${bm.incharge} books flights from ${airportInfo.name} and submits the visa within 24-48 hours. End-to-end confirmation usually takes 3-5 business days.` },
    { q: `Can a group from ${district.name} travel together for Hajj ${HAJJ_YEAR}?`, a: `Yes — group Hajj from ${district.name} is one of the most popular services we coordinate. We arrange synchronised departure dates, group hotels in Makkah (near Masjid al-Haram) and Madinah (near Masjid an-Nabawi), shared ground transport, and a single point of contact through ${bm.incharge}. Minimum group size is typically 8 people, but smaller family groups are also supported. Hajj ${HAJJ_YEAR} booking is open — reach out early for the best hotel inventory.` },
    { q: `What payment options does Al Bari Travel accept from ${district.name} clients?`, a: `We accept cash, bank transfer, JazzCash, and Easypaisa from clients in ${district.name}. Bookings are confirmed once a deposit is received; the balance is due before the visa submission. ${bm.incharge} will walk you through the schedule on the first call.` },
    { q: `Does Al Bari Travel arrange airport transfers from ${district.name} to ${airportInfo.name}?`, a: `Most pilgrims from ${district.name} fly out of ${airportInfo.name} (${airportInfo.code}). We coordinate pickup arrangements where possible; specific routes and rates are confirmed once your booking is finalised. Contact ${bm.incharge} at ${bm.phoneDisplay} to discuss.` },
    { q: `Are family Umrah packages available for ${district.name} pilgrims?`, a: `Yes. Many of our ${district.name} clients travel as family groups — couples, parents with adult children, multi-generational. We tailor hotel categories near the Haram in Makkah and Madinah, room types, and Ziyarat tour pacing to suit the family. ${bm.incharge} can suggest packages once we understand the group composition.` },
    { q: `What is the best time of year to book Umrah from ${district.name}?`, a: `Umrah from ${district.name} runs year-round. Off-peak months (mid-September through October, late February through April) offer the best rates and least crowded conditions in Makkah. Ramadan and the weeks around Hajj are most expensive. ${bm.incharge} can advise on the optimal window for your situation.` },
    { q: `What is the cheapest Umrah package available from ${district.name}?`, a: `Economy Umrah packages from ${district.name} start at the lowest tier we offer — typically a 10-day trip with 3-star hotel accommodation a short walk from the Haram, shared transport, and round-trip flights from ${airportInfo.name}. Exact pricing varies by season and dates. WhatsApp ${bm.incharge} at ${bm.phoneDisplay} for a live quote.` },
    { q: `Do I need to be in Hasan Abdal to book through Al Bari Travel?`, a: `No. ${district.name} clients can book entirely remotely. Our team in ${bm.regionalHubLocation} handles your application, visa, and ticketing end-to-end. Documents are shared via WhatsApp or email; the only thing you collect in person (if you wish) is the final visa stamping — and even that we can courier where possible.` },
    { q: `Which airlines do you book for Umrah flights from ${district.name}?`, a: `From ${airportInfo.name} (${airportInfo.code}) we book PIA (Pakistan International Airlines), Saudi Airlines (Saudia), Air Sial, AirBlue, Qatar Airways, and Emirates depending on departure date and budget. Most Umrah pilgrims from ${district.name} fly direct or with a single stopover.` },
    { q: `What is included in an Al Bari Travel Umrah package from ${district.name}?`, a: `A standard Umrah package from ${district.name} includes: return international flights, Saudi e-visa, hotel accommodation in Makkah (near Masjid al-Haram) and Madinah (near Masjid an-Nabawi), ground transport between cities, guided Ziyarat tour of historical Islamic sites, and full in-country support. Meals, Zamzam water, and laundry are typically extra unless you select a premium package.` },
    { q: `Which airport do pilgrims from ${district.name} fly from for Umrah and Hajj?`, a: `The nearest airport to ${district.name} is ${airportInfo.name} (${airportInfo.code}). ${airportInfo.route} ${bm.incharge} arranges the full routing and ticketing so you travel with the fewest connections possible.` },
    { q: `Can Al Bari Travel arrange the connecting flights for pilgrims from ${district.name}?`, a: `Yes. ${airportInfo.route} We book the domestic leg and the international leg together on one itinerary for ${district.name} pilgrims, so there is no gap between flights and your baggage is checked through where the airlines allow it.` },
  ];
  const seed = hashSlug(district.slug);
  const picked = [];
  const used = new Set();
  // Pick 4 unique indices in a stable, district-specific order so each district has a different mix.
  for (let i = 0; i < faqPool.length && picked.length < 4; i++) {
    const idx = (seed + i * 7) % faqPool.length;
    if (!used.has(idx)) { used.add(idx); picked.push(faqPool[idx]); }
  }
  const faqs = picked;

  // Related districts: 3 alphabetically adjacent in the same province (excluding self and any linked-office districts).
  const peers = province.districts.filter(d => d.slug !== district.slug && !d.linkedOfficeSlug);
  const myIdx = peers.findIndex(d => d.slug > district.slug);
  const startIdx = Math.max(0, (myIdx === -1 ? peers.length : myIdx) - 1);
  const relatedDistricts = peers.slice(startIdx, startIdx + 3);
  if (relatedDistricts.length < 3) {
    // pad from the start of the alphabetical list
    for (const d of peers) {
      if (relatedDistricts.length >= 3) break;
      if (!relatedDistricts.includes(d)) relatedDistricts.push(d);
    }
  }
  const relatedDistrictsHtml = relatedDistricts.map(d => `
        <a class="district-card-link" href="/offices/${province.slug}/${d.slug}/"><article class="district-card"><span class="district-card-badge">Nearby</span><h3>${escapeHtml(d.name)}</h3><span class="district-card-cta">View ${escapeHtml(d.name)} &rarr;</span></article></a>`).join('');

  // HowTo schema — eligible for Google HowTo rich snippet. Specific to "book Umrah from {District}".
  const howToSchema = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: `How to book an Umrah package from ${district.name}, ${province.name}`,
  description: `Step-by-step process for booking Umrah from ${district.name} with Al Bari Travel & Tours — from initial enquiry to flying out of ${airportInfo.name}.`,
  totalTime: 'P5D',
  estimatedCost: { '@type': 'MonetaryAmount', currency: 'PKR', value: '150000' },
  supply: [
    { '@type': 'HowToSupply', name: 'Valid passport (6+ months validity)' },
    { '@type': 'HowToSupply', name: 'Recent passport-size photos' },
    { '@type': 'HowToSupply', name: 'NIC copy' }
  ],
  tool: [
    { '@type': 'HowToTool', name: 'Phone or WhatsApp' }
  ],
  step: [
    { '@type': 'HowToStep', name: 'Contact Al Bari Travel', text: `Call or WhatsApp ${bm.incharge} at ${bm.phoneDisplay}. Share your preferred dates, group size, and budget range.`, url: `${site.domain}/offices/${province.slug}/${district.slug}/#contact-block` },
    { '@type': 'HowToStep', name: 'Get a quote', text: `Within 1-2 hours you receive a package quotation tailored for ${district.name} — including flights from ${airportInfo.name}, hotels in Makkah and Madinah, and Saudi visa.` },
    { '@type': 'HowToStep', name: 'Confirm with a deposit', text: 'Pay a confirmation deposit by bank transfer, JazzCash, Easypaisa, or cash. The remaining balance is due before visa submission.' },
    { '@type': 'HowToStep', name: 'Submit documents', text: 'Share your passport, NIC copy, and photos via WhatsApp. Al Bari Travel submits the Saudi visa application on your behalf.' },
    { '@type': 'HowToStep', name: 'Receive ticket and visa', text: `Within 3-5 business days you receive the Saudi visa and flight tickets from ${airportInfo.name}. Pre-departure briefing is provided.` },
    { '@type': 'HowToStep', name: 'Fly to Saudi Arabia', text: `Depart from ${airportInfo.name} (${airportInfo.code}) to Jeddah (JED) or Madinah (MED). Al Bari Travel coordinates ground transport and hotel check-in on arrival.` }
  ]
}, null, 2)}
</script>`;

  const faqHtml = faqs.map(f => `
        <details class="faq-item">
            <summary><h3 style="display:inline;margin:0;font-size:1.1rem;">${escapeHtml(f.q)}</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>${escapeHtml(f.a)}</p></div>
        </details>`).join('');

  const faqSchema = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": ${JSON.stringify(faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a }
  })), null, 2)}
}
</script>`;

  const ctx = {
    name: district.name,
    provinceName: province.name,
    provinceSlug: province.slug,
    country: province.country,
    addressCountry: province.addressCountry,
    addressRegion: province.addressRegion,
    regionalHubLocality: bm.regionalHubLocation.split(',')[0].trim(),
    regionalHubLocation: bm.regionalHubLocation,
    incharge: bm.incharge,
    title: bm.title,
    phoneDisplay: bm.phoneDisplay,
    phoneE164: bm.phoneE164,
    intro,
    canonical: `${site.domain}/offices/${province.slug}/${district.slug}/`,
    seoTitle: `Umrah & Hajj from ${district.name} | Al Bari Travel & Tours`,
    // Trimmed to ~150-160 chars (Google SERP display cap). Keep airport code + brand contact.
    seoDescription: `Book Umrah and Hajj from ${district.name}, ${province.name}. Flights via ${airportInfo.code}, Saudi visa, group departures. Call ${bm.phoneDisplay}.`.slice(0, 158),
    ogType: 'place',
    ctaButtons: ctaButtons.map(b => '                    ' + b).join('\n'),
    faqHtml,
    faqSchema,
    howToSchema,
    hajjYear: String(HAJJ_YEAR),
    hajjDates: HAJJ_DATES[HAJJ_YEAR] ? `${new Date(HAJJ_DATES[HAJJ_YEAR].start).toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:'UTC'})}–${new Date(HAJJ_DATES[HAJJ_YEAR].end).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}` : `mid-May ${HAJJ_YEAR}`,
    airportName: `${airportInfo.name} (${airportInfo.code})`,
    relatedDistrictsHtml,
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile(`offices/${province.slug}/${district.slug}/index.html`, render(tpl, ctx));
}

function buildOfficesLanding() {
  const tpl = readTemplate('offices-landing.html');
  const ctx = {
    seoTitle: 'Our Offices | Al Bari Travel & Tours — Pakistan & USA Locations',
    seoDescription: 'Al Bari Travel & Tours offices in Hasan Abdal, Pakistan and Texas, USA. Trusted Umrah, Hajj, and luxury travel packages from two locations.',
    canonical: `${site.domain}/offices/`,
    ogType: 'website',
    officeCards: offices.map(officeCardHtml).join('\n'),
    provinceCards: provinces.map(provinceCardHtml).join('\n'),
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile('offices/index.html', render(tpl, ctx));
}

function buildOfficePage(office) {
  const tpl = readTemplate('office.html');
  const others = offices.filter(o => o.slug !== office.slug);
  const ctx = {
    ...office,
    seoTitle: office.seoTitle,
    seoDescription: office.seoDescription,
    canonical: `${site.domain}/offices/${office.slug}/`,
    ogType: 'place',
    addressLocality: office.city,
    addressRegion: office.region,
    openingHoursDisplay: office.phoneHours,
    languagesDisplay: office.languages.join(' · '),
    currenciesAccepted: office.currenciesAccepted,
    paymentAccepted: office.paymentAccepted,
    priceRange: office.priceRange,
    knowsLanguageJson: JSON.stringify(office.languages),
    ctaButtons: ctaButtonsHtml(office),
    serviceList: serviceListHtml(office),
    otherOfficeCards: others.map(officeCardHtml).join('\n'),
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile(`offices/${office.slug}/index.html`, render(tpl, ctx));
}

// ------------------------------------------------------------------
// Blog posts + landing
// ------------------------------------------------------------------

function formatPublishDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch { return iso; }
}

function blogPostCardHtml(post) {
  return `        <a href="/blog/${post.slug}/" class="blog-card-link" aria-label="Read ${escapeHtml(post.title)}">
            <article class="blog-card">
                <div class="blog-card-category">${escapeHtml(post.category)}</div>
                <h3 class="blog-card-title">${escapeHtml(post.title)}</h3>
                <p class="blog-card-excerpt">${escapeHtml(post.excerpt)}</p>
                <div class="blog-card-meta">
                    <span>${escapeHtml(post.author)}</span>
                    <span aria-hidden="true">·</span>
                    <span>${formatPublishDate(post.publishedAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>${post.readingTimeMinutes} min read</span>
                </div>
            </article>
        </a>`;
}

function buildBlogLanding() {
  const tpl = readTemplate('blog-landing.html');
  // Sort posts newest first
  const sorted = [...blog.posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const ctx = {
    seoTitle: 'Blog | Al Bari Travel & Tours — Umrah, Hajj, Visa Guides',
    seoDescription: 'Practical guides for Pakistani pilgrims and travellers: Umrah, Hajj 2027, Saudi visa, student visa, work visa, flight booking. Written by Al Bari Travel team.',
    canonical: `${site.domain}/blog/`,
    ogType: 'website',
    postCards: sorted.map(blogPostCardHtml).join('\n'),
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile('blog/index.html', render(tpl, ctx));
}

function buildBlogPost(post) {
  const tpl = readTemplate('blog-post.html');

  // FAQ block (rendered inline + JSON-LD schema)
  let faqBlock = '';
  let faqSchema = '';
  if (post.faqs && post.faqs.length) {
    faqBlock = `
        <section class="blog-faq-section" style="margin-top:50px;padding-top:30px;border-top:1px solid rgba(255,255,255,0.08);">
            <h2>Frequently Asked Questions</h2>
${post.faqs.map(f => `
            <details class="faq-item" style="margin-top:14px;">
                <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">${escapeHtml(f.q)}</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
                <div class="faq-answer"><p>${escapeHtml(f.a)}</p></div>
            </details>`).join('')}
        </section>`;
    faqSchema = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': post.faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a }
  }))
}, null, 2)}
</script>`;
  }

  // Related posts: same category preferred, else most recent
  const sorted = [...blog.posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const sameCat = sorted.filter(p => p.slug !== post.slug && p.category === post.category).slice(0, 3);
  const fillers = sorted.filter(p => p.slug !== post.slug && !sameCat.find(s => s.slug === p.slug));
  const related = [...sameCat, ...fillers].slice(0, 3);
  const relatedPostsHtml = related.map(blogPostCardHtml).join('\n');

  // CTA based on related service
  const ctaMap = {
    'hajj-and-umrah': { heading: 'Plan your Umrah or Hajj with us', subtext: 'Quotes within hours, named Regional Representative end-to-end.', button: 'See Hajj & Umrah Packages', link: '/services/hajj-and-umrah/' },
    'airline-tickets': { heading: 'Need an international flight from Pakistan?', subtext: 'Best-fare comparison across PIA, Saudia, Air Sial, Emirates, Qatar and more.', button: 'See Flight Service', link: '/services/airline-tickets/' },
    'student-visas': { heading: 'Applying for a student visa?', subtext: 'End-to-end help: documents, financials, embassy bookings.', button: 'See Student Visa Service', link: '/services/student-visas/' },
    'visit-visas': { heading: 'Planning a visit abroad?', subtext: 'Tourist + family visit visa support for Schengen, UK, USA, Saudi, UAE and more.', button: 'See Visit Visa Service', link: '/services/visit-visas/' },
    'work-visas': { heading: 'Heading to the Gulf for work?', subtext: 'Full visa pipeline: attestation, GAMCA, PCC, embassy stamping.', button: 'See Work Visa Service', link: '/services/work-visas/' },
  };
  const cta = ctaMap[post.relatedServiceSlug] || ctaMap['hajj-and-umrah'];

  // Approximate word count from body (strip HTML for count)
  const plainText = post.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.split(/\s+/).length;

  const ctx = {
    title: post.title,
    seoTitle: post.seoTitle || post.title,
    seoDescription: post.seoDescription,
    canonical: `${site.domain}/blog/${post.slug}/`,
    ogType: 'article',
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt || post.publishedAt,
    publishedDisplay: formatPublishDate(post.publishedAt),
    author: post.author,
    authorTitle: post.authorTitle,
    authorBio: post.authorBio || `${post.author} is ${post.authorTitle} at Al Bari Travel & Tours, coordinating Umrah, Hajj, and international travel bookings for Pakistani families since 2018.`,
    category: post.category,
    readingTimeMinutes: String(post.readingTimeMinutes),
    wordCount: String(wordCount),
    body: post.body,
    faqBlock,
    faqSchema,
    relatedPostsHtml,
    ctaHeading: cta.heading,
    ctaSubtext: cta.subtext,
    ctaButton: cta.button,
    ctaLink: cta.link,
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile(`blog/${post.slug}/index.html`, render(tpl, ctx));
}

// ------------------------------------------------------------------
// Forms page (/forms/) — SEO hub of downloadable travel & visa forms
// ------------------------------------------------------------------

function buildFormsPage() {
  const forms = readJson('forms.json');
  const tpl = readTemplate('forms-page.html');

  // Build TOC links
  const tocLinks = forms.categories.map(c => `<a href="#cat-${c.slug}" style="color:#fff;opacity:0.85;text-decoration:none;font-size:0.9rem;padding:6px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);transition:all 0.2s;display:inline-block;">${c.name}</a>`).join('');

  // Build category sections with form cards
  const categorySections = forms.categories.map(cat => {
    const catForms = forms.forms.filter(f => f.category === cat.slug);
    if (catForms.length === 0) return '';
    const cardsHtml = catForms.map(f => `
            <article class="form-card" id="form-${f.slug}">
                <div class="form-card-meta">
                    <span class="form-card-type">${escapeHtml(f.fileType)}</span>
                    <span class="form-card-source">${f.source}</span>
                </div>
                <h3 class="form-card-title">${escapeHtml(f.title)}</h3>
                <p class="form-card-desc">${f.description}</p>
                <div class="form-card-footer">
                    <a href="${escapeHtml(f.downloadUrl)}" ${f.downloadType === 'external' ? 'target="_blank" rel="noopener nofollow"' : ''} class="form-card-cta">${f.downloadLabel} ${f.downloadType === 'external' ? '↗' : (f.downloadType === 'page' ? '→' : '↓')}</a>
                    <span class="form-card-size">${escapeHtml(f.fileSize)}</span>
                </div>
            </article>`).join('');
    return `
        <section class="forms-category" id="cat-${cat.slug}" style="margin-top:50px;">
            <div class="forms-cat-header">
                <h2 class="forms-cat-title">${cat.name}</h2>
                <p class="forms-cat-desc">${cat.description}</p>
            </div>
            <div class="forms-grid" style="margin-top:24px;">
                ${cardsHtml}
            </div>
        </section>`;
  }).join('');

  // ItemList schema entries (each form as a ListItem)
  const itemListJson = JSON.stringify(forms.forms.map((f, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    name: f.title.replace(/&amp;/g, '&'),
    url: f.downloadType === 'external' ? f.downloadUrl : `https://www.albaritravelspk.com${f.downloadUrl}`,
    description: f.description.replace(/&amp;/g, '&').replace(/<[^>]+>/g, ''),
  })), null, 2);

  // FAQ schema for forms page
  const faqs = [
    { q: 'Are these travel and visa forms free to download?', a: 'Yes. Every form on this page is free. Some link to official Pakistani or foreign government sources (NADRA, DGI&P, MoRA, Saudi MoFA, VFS Global); others are Al Bari Travel & Tours templates we share with our community.' },
    { q: 'Can I trust the Saudi Hajj and Umrah application forms here?', a: 'The Pakistan Hajj Government Scheme form links directly to the Ministry of Religious Affairs (MoRA). The Saudi Umrah visa document checklists are based on current Saudi MoFA and Nusuk Masar requirements. We update this page whenever Saudi MoFA or MoRA changes their procedures.' },
    { q: 'How can I submit a form to be added to this page?', a: 'Scroll to the "Have a form to share?" section, fill in the form name, category, description, and upload your file. We review every submission and add forms that help fellow Pakistani travellers, with credit to the contributor.' },
    { q: 'Why are some forms listed as "Coming soon"?', a: 'We are gradually building out the Al Bari Travel & Tours templates (Umrah booking checklists, Mahram affidavits, cover letter templates). Forms marked "Coming soon" will be uploaded over the next few weeks. In the meantime, WhatsApp us at +92 315 9596161 and we can send you a copy directly.' },
    { q: 'Do you help with filling out these forms?', a: 'Yes. Our team handles Saudi visa, Schengen, UK student, Hajj, Umrah, and Gulf work-visa paperwork daily. Send us a photo of the form via WhatsApp and we will guide you through it. There is no charge for guidance — only if we handle the full file end-to-end.' }
  ];

  const faqSchemaJson = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a }
  }))
}, null, 2)}
</script>`;

  const ctx = {
    seoTitle: 'Travel & Visa Forms | Al Bari Travel & Tours — Pakistan',
    seoDescription: 'Download Saudi Umrah, Hajj 2027, Schengen, UK student visa, GAMCA medical, POE Protector, Pakistan passport, and NADRA forms — all curated and current for Pakistani applicants.',
    canonical: `${site.domain}/forms/`,
    ogType: 'website',
    formsCount: String(forms.forms.length),
    categoriesCount: String(forms.categories.length),
    tocLinks,
    categorySections,
    itemListJson,
    faqSchema: faqSchemaJson,
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile('forms/index.html', render(tpl, ctx));
}

// Build a dedicated info page for each form whose downloadType === 'page'
function buildFormInfoPages() {
  const forms = readJson('forms.json');
  const tpl = readTemplate('form-info-page.html');
  const pageForms = forms.forms.filter(f => f.downloadType === 'page' && f.pageBody);
  if (pageForms.length === 0) return;

  pageForms.forEach(f => {
    // FAQ block + schema
    let faqBlock = '';
    let faqSchema = '';
    const faqs = f.pageFaqs || [];
    if (faqs.length) {
      faqBlock = `
        <section class="blog-faq-section" style="margin-top:50px;padding-top:30px;border-top:1px solid rgba(255,255,255,0.08);">
            <h2>Frequently Asked Questions</h2>
${faqs.map(q => `
            <details class="faq-item" style="margin-top:14px;">
                <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">${escapeHtml(q.q)}</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
                <div class="faq-answer"><p>${escapeHtml(q.a)}</p></div>
            </details>`).join('')}
        </section>`;
      faqSchema = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': faqs.map(q => ({
    '@type': 'Question',
    name: q.q,
    acceptedAnswer: { '@type': 'Answer', text: q.a }
  }))
}, null, 2)}
</script>`;
    }

    // Related forms: same category, then fill up to 3
    const sameCat = forms.forms.filter(x => x.slug !== f.slug && x.category === f.category).slice(0, 3);
    const otherForms = forms.forms.filter(x => x.slug !== f.slug && !sameCat.find(s => s.slug === x.slug));
    const related = [...sameCat, ...otherForms].slice(0, 3);
    const relatedCardsHtml = related.map(r => `
            <article class="form-card">
                <div class="form-card-meta">
                    <span class="form-card-type">${escapeHtml(r.fileType)}</span>
                    <span class="form-card-source">${r.source}</span>
                </div>
                <h3 class="form-card-title">${escapeHtml(r.title)}</h3>
                <p class="form-card-desc">${r.description.slice(0, 220)}${r.description.length > 220 ? '...' : ''}</p>
                <div class="form-card-footer">
                    <a href="${escapeHtml(r.downloadUrl)}" ${r.downloadType === 'external' ? 'target="_blank" rel="noopener nofollow"' : ''} class="form-card-cta">${r.downloadLabel} ${r.downloadType === 'external' ? '↗' : (r.downloadType === 'page' ? '→' : '↓')}</a>
                    <span class="form-card-size">${escapeHtml(r.fileSize)}</span>
                </div>
            </article>`).join('');

    // Word count
    const plainText = f.pageBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainText.split(/\s+/).length;
    const readingTimeMinutes = Math.max(3, Math.round(wordCount / 220));

    // Category label
    const cat = forms.categories.find(c => c.slug === f.category);
    const categoryLabel = cat ? cat.name.replace(/&amp;/g, '&') : f.category;

    const publishedAt = '2026-06-24';
    const updatedAt = '2026-06-24';

    const ctx = {
      seoTitle: f.pageSeoTitle || f.pageTitle || f.title,
      seoDescription: f.pageSeoDescription || f.description,
      canonical: `${site.domain}${f.downloadUrl}`,
      ogType: 'article',
      title: f.pageTitle || f.title,
      categoryLabel,
      category: f.category,
      publishedAt,
      updatedAt,
      publishedDisplay: formatPublishDate(publishedAt),
      readingTimeMinutes: String(readingTimeMinutes),
      wordCount: String(wordCount),
      body: f.pageBody,
      faqBlock,
      faqSchema,
      relatedCardsHtml,
      footerOfficeList: footerOfficeListHtml(),
      year: String(new Date().getFullYear()),
    };
    writeFile(`forms/${f.slug}/index.html`, render(tpl, ctx));
  });
}

// ------------------------------------------------------------------
// Service pages (Hajj & Umrah, Airline Tickets, Student Visas, etc.)
// ------------------------------------------------------------------

function serviceCardHtml(service) {
  const featured = service.featured ? ' featured' : '';
  const badge = service.featured ? `<span class="package-badge">Most Popular</span>` : '';
  const bullets = service.cardBullets.map(b => `                    <li>${escapeHtml(b)}</li>`).join('\n');
  return `            <a href="/services/${service.slug}/" class="package-card-link" style="text-decoration:none;color:inherit;display:block;">
            <article class="package-card${featured}">
                ${badge}
                <div style="font-size:2rem;margin-bottom:14px;line-height:1;" aria-hidden="true">${service.icon}</div>
                <h3>${escapeHtml(service.name)}</h3>
                <p class="package-tagline" style="color:rgba(255,255,255,0.7);font-size:0.95rem;margin-bottom:18px;line-height:1.5;">${escapeHtml(service.tagline)}</p>
                <ul class="package-features">
${bullets}
                </ul>
                <span class="btn btn-primary" style="width:100%;text-align:center;display:block;">${escapeHtml(service.primaryCta)}</span>
            </article>
            </a>`;
}

function buildServicesLanding() {
  const tpl = readTemplate('services-landing.html');
  const ctx = {
    seoTitle: 'Our Services | Al Bari Travel & Tours — Hajj, Umrah, Flights, Visas',
    seoDescription: 'Al Bari Travel & Tours services: Hajj & Umrah packages, international flights, student visas, visit visas, and Gulf work visas. Pakistan + USA.',
    canonical: `${site.domain}/services/`,
    ogType: 'website',
    serviceCards: services.map(serviceCardHtml).join('\n'),
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile('services/index.html', render(tpl, ctx));
}

function buildServicePage(service) {
  const tpl = readTemplate('service.html');

  const includedListHtml = service.whatsIncluded
    .map(item => `            <li>${escapeHtml(item)}</li>`)
    .join('\n');

  let tiersHtml = '';
  if (service.tiers && service.tiers.length) {
    // Compact pricing comparison table FIRST (snapshot for skimmers)
    const tableRows = service.tiers.map(t => `
                <tr>
                    <td><strong>${escapeHtml(t.name)}</strong><br><span style="opacity:0.65;font-size:0.85em;">${escapeHtml(t.duration)}</span></td>
                    <td class="tier-price">${escapeHtml(t.priceRange || 'Custom — request quote')}</td>
                    <td style="font-size:0.9em;opacity:0.85;">${escapeHtml(t.highlights[0] || '')}</td>
                </tr>`).join('');
    // Detail cards SECOND (for those who want depth)
    const tierCards = service.tiers.map(t => `
                <article class="package-card" style="padding:30px 28px;">
                    <h3 style="font-size:1.3rem;">${escapeHtml(t.name)}</h3>
                    <p class="package-tagline" style="color:#c9a962;font-size:0.85rem;margin-bottom:6px;text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(t.duration)}</p>
                    ${t.priceRange ? `<p style="color:#c9a962;font-weight:600;font-size:1rem;margin-bottom:14px;">${escapeHtml(t.priceRange)}</p>` : ''}
                    <ul class="package-features">
${t.highlights.map(h => `                        <li>${escapeHtml(h)}</li>`).join('\n')}
                    </ul>
                </article>`).join('\n');
    tiersHtml = `
        <div class="section-header" style="margin:50px 0 24px;">
            <h2 style="font-size:1.6rem;text-align:left;">Pricing at a glance</h2>
            <p style="text-align:left;margin-top:8px;font-size:0.9rem;opacity:0.75;">Indicative 2026 ranges — final quotes depend on dates, party size, exact hotel selection, and currency conversion at time of booking.</p>
        </div>
        <table class="pricing-tier-table">
            <thead><tr><th>Tier</th><th>Per-person range</th><th>Headline feature</th></tr></thead>
            <tbody>${tableRows}
            </tbody>
        </table>
        <div class="section-header" style="margin:50px 0 24px;">
            <h2 style="font-size:1.6rem;text-align:left;">Tier details</h2>
        </div>
        <div class="packages-grid">${tierCards}
        </div>`;
  }

  // Routes table (currently only Airline Tickets uses this)
  let routesHtml = '';
  if (service.routes && service.routes.length) {
    const routeRows = service.routes.map(r => `
                <div class="route-row">
                    <div class="route-dest">${escapeHtml(r.destination)}</div>
                    <div class="route-carriers">${escapeHtml(r.carriers)}</div>
                </div>`).join('\n');
    routesHtml = `
        <div class="section-header" style="margin:50px 0 24px;">
            <h2 style="font-size:1.6rem;text-align:left;">Popular routes from Pakistan</h2>
        </div>
        <div class="routes-table">${routeRows}
        </div>`;
  }

  // Key facts callout — quick-reference info box above the overview
  let keyFactsHtml = '';
  if (service.keyFacts && service.keyFacts.length) {
    const factRows = service.keyFacts.map(f => `
            <div class="key-fact-row">
                <div class="key-fact-label">${escapeHtml(f.label)}</div>
                <div class="key-fact-value">${escapeHtml(f.value)}</div>
            </div>`).join('\n');
    keyFactsHtml = `
        <aside class="key-facts" aria-label="Key facts" style="margin-bottom:40px;">
            <div class="key-facts-header">At a glance</div>${factRows}
        </aside>`;
  }

  const faqHtml = service.faqs.map(f => `
        <details class="faq-item">
            <summary><h3 style="display:inline;margin:0;font-size:1.1rem;">${escapeHtml(f.q)}</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>${escapeHtml(f.a)}</p></div>
        </details>`).join('');

  const faqSchema = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': service.faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a }
  }))
}, null, 2)}
</script>`;

  // Cost calculator widget — only on Hajj & Umrah service page
  const calcWidget = service.slug === 'hajj-and-umrah' ? `
        <div class="section-header" style="margin:50px 0 24px;">
            <h2 style="font-size:1.6rem;text-align:left;">Estimate your Umrah cost</h2>
            <p style="text-align:left;margin-top:8px;font-size:0.9rem;opacity:0.75;">Interactive 2026 estimate — for an exact quote, send your details to your Regional Rep.</p>
        </div>
        <div id="umrah-cost-calc"></div>` : '';

  const ctx = {
    name: service.name,
    heroEyebrow: service.heroEyebrow,
    heroHeading: service.heroHeading,
    heroLede: service.heroLede,
    intro: service.intro,
    primaryCta: service.primaryCta,
    canonical: `${site.domain}/services/${service.slug}/`,
    seoTitle: service.seoTitle,
    seoDescription: service.seoDescription,
    ogType: 'website',
    includedListHtml,
    tiersHtml: tiersHtml + calcWidget,
    routesHtml,
    keyFactsHtml,
    faqHtml,
    faqSchema,
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile(`services/${service.slug}/index.html`, render(tpl, ctx));
}

// ------------------------------------------------------------------
// Static pages (About, Contact, Privacy, Terms)
// ------------------------------------------------------------------

const STATIC_PAGES = [
  {
    slug: 'about',
    pageName: 'About Us',
    pageSchemaType: 'AboutPage',
    eyebrow: 'Our Story',
    h1: 'About Al Bari Travel & Tours',
    lede: 'A family-run travel agency built on trust, transparent pricing, and personal service for every Umrah, Hajj, and international travel journey.',
    seoTitle: 'About Al Bari Travel & Tours | Family-run Umrah & Hajj Agency',
    seoDescription: 'Al Bari Travel & Tours — a family-run Umrah, Hajj, and international travel agency serving Pakistan + USA through named Regional Representatives. Remote-first, transparent.',
    body: `
        <h2>Who we are</h2>
        <p style="margin-top:14px;line-height:1.8;">Al Bari Travel & Tours is a family-run travel agency that has been serving the Pakistani and Pakistani-American community since 2018. We coordinate Umrah, Hajj, and international flight bookings with a personal touch — every client is matched with a named <strong>Regional Representative</strong> who handles their journey end-to-end, by phone and WhatsApp.</p>

        <div class="trust-stats" role="list" aria-label="Al Bari Travel by the numbers">
            <div class="trust-stat" role="listitem">
                <div class="trust-stat-num">8<span class="trust-stat-unit">+</span></div>
                <div class="trust-stat-label">Years serving families</div>
                <div class="trust-stat-sub">Founded 2018</div>
            </div>
            <div class="trust-stat" role="listitem">
                <div class="trust-stat-num">7</div>
                <div class="trust-stat-label">Regional Representatives</div>
                <div class="trust-stat-sub">Pakistan &amp; USA</div>
            </div>
            <div class="trust-stat" role="listitem">
                <div class="trust-stat-num">170</div>
                <div class="trust-stat-label">Districts covered</div>
                <div class="trust-stat-sub">Branch network</div>
            </div>
            <div class="trust-stat" role="listitem">
                <div class="trust-stat-num">4</div>
                <div class="trust-stat-label">Languages spoken</div>
                <div class="trust-stat-sub">English · Urdu · Punjabi · Pashto</div>
            </div>
        </div>

        <h2 style="margin-top:50px;">What we do</h2>
        <p style="margin-top:12px;opacity:0.78;line-height:1.7;">Five service lines, end-to-end handled by named humans on your case — no call centres, no bots, no churn.</p>
        <div class="about-services-grid" style="margin-top:28px;">
            <a href="/services/hajj-and-umrah/" class="about-service-link"><article class="about-service-card">
                <div class="about-service-num">01</div>
                <h3>Hajj &amp; Umrah Packages</h3>
                <p>Economy through premium tiers. Year-round Umrah departures from Lahore, Karachi &amp; Islamabad. Coordinated Hajj groups with full logistics and accommodation near the Haram.</p>
                <span class="about-service-cta">View packages &rarr;</span>
            </article></a>
            <a href="/services/airline-tickets/" class="about-service-link"><article class="about-service-card">
                <div class="about-service-num">02</div>
                <h3>International Flight Booking</h3>
                <p>Saudi Arabia, UAE, USA, UK, and beyond — from any major Pakistani airport. Best-fare comparison across PIA, Saudia, Air Sial, Emirates, Qatar, Etihad, and Turkish.</p>
                <span class="about-service-cta">See flight service &rarr;</span>
            </article></a>
            <a href="/services/student-visas/" class="about-service-link"><article class="about-service-card">
                <div class="about-service-num">03</div>
                <h3>Student Visa Processing</h3>
                <p>UK, USA, Canada, Australia, and Schengen student visas — end-to-end help: CAS / I-20 / acceptance letter, financial evidence, IELTS prep referral, embassy bookings.</p>
                <span class="about-service-cta">See student visas &rarr;</span>
            </article></a>
            <a href="/services/visit-visas/" class="about-service-link"><article class="about-service-card">
                <div class="about-service-num">04</div>
                <h3>Visit &amp; Tourist Visas</h3>
                <p>Schengen, UK, USA, Canada, Saudi, UAE, Malaysia, Thailand — full documentation, bank statement prep, itinerary planning, hotel &amp; flight bookings supplied for the file.</p>
                <span class="about-service-cta">See visit visas &rarr;</span>
            </article></a>
            <a href="/services/work-visas/" class="about-service-link"><article class="about-service-card">
                <div class="about-service-num">05</div>
                <h3>Gulf Work Visas</h3>
                <p>Saudi, UAE, Qatar, Bahrain, Oman, Kuwait — full pipeline: HEC + MoFA + embassy attestation, GAMCA medical, PCC, embassy stamping, POE Protector clearance.</p>
                <span class="about-service-cta">See work visas &rarr;</span>
            </article></a>
        </div>

        <h2 style="margin-top:60px;">How we're organised</h2>
        <p style="margin-top:14px;line-height:1.8;">Al Bari Travel runs as a <strong>remote-first agency</strong>. We don't operate brick-and-mortar storefronts. Instead, we work through <strong>named Regional Representatives</strong> who each cover a part of Pakistan or the USA — every enquiry handled by a named human who owns your booking end-to-end.</p>
        <div class="about-reps-grid" style="margin-top:28px;">
            <article class="about-rep-card about-rep-card--hub">
                <div class="about-rep-region">Hasan Abdal · Punjab</div>
                <h3>Haiwad Ahmad</h3>
                <div class="about-rep-role">Regional Branch Manager &middot; Central hub</div>
            </article>
            <article class="about-rep-card">
                <div class="about-rep-region">Rawalpindi · Punjab</div>
                <h3>Maaz Ali</h3>
                <div class="about-rep-role">Regional Representative</div>
            </article>
            <article class="about-rep-card">
                <div class="about-rep-region">Taxila · Punjab</div>
                <h3>Jawad Ahmad</h3>
                <div class="about-rep-role">Regional Representative</div>
            </article>
            <article class="about-rep-card">
                <div class="about-rep-region">Swabi · KP</div>
                <h3>Yawar Hayat</h3>
                <div class="about-rep-role">Regional Representative</div>
            </article>
            <article class="about-rep-card">
                <div class="about-rep-region">Mardan · KP</div>
                <h3>Muhammad Huzaifa</h3>
                <div class="about-rep-role">Regional Representative</div>
            </article>
            <article class="about-rep-card">
                <div class="about-rep-region">Peshawar · KP</div>
                <h3>Faisal Khan</h3>
                <div class="about-rep-role">Regional Representative</div>
            </article>
            <article class="about-rep-card">
                <div class="about-rep-region">Texas · USA</div>
                <h3>Hamid Ali</h3>
                <div class="about-rep-role">Serving Pakistani-American community</div>
            </article>
        </div>
        <p style="margin-top:28px;line-height:1.8;opacity:0.85;">Beyond our 7 Regional Representatives, our remote agent network serves <strong>every district of Pakistan — all 170 of them</strong> — entirely by phone, WhatsApp, and email.</p>

        <h2 style="margin-top:40px;">How we work</h2>
        <p style="margin-top:14px;line-height:1.8;">No call centres, no bots, no walk-in fuss. Every enquiry is handled by a named human Regional Representative who owns your booking end-to-end. Quotations within hours, bookings confirmed within days, no hidden fees. All documentation is handled remotely — you only travel when you fly out to Saudi Arabia.</p>

        <h2 style="margin-top:40px;">Get in touch</h2>
        <p style="margin-top:14px;line-height:1.8;">The fastest way to reach us is WhatsApp on <a href="https://wa.me/923159596161" style="color:#c9a962;">+92 315 9596161</a> or visit our <a href="/contact/" style="color:#c9a962;">Contact page</a> for every office's direct line. You can also browse <a href="/offices/" style="color:#c9a962;">all our locations</a> to find the office nearest you.</p>
    `,
    extraSchema: '',
  },
  {
    slug: 'contact',
    pageName: 'Contact Us',
    pageSchemaType: 'ContactPage',
    eyebrow: 'Talk to a Human',
    h1: 'Contact Al Bari Travel & Tours',
    lede: 'Every Regional Representative answers their phone personally. Pick the one closest to you, or WhatsApp our main line for an immediate response.',
    seoTitle: 'Contact Al Bari Travel & Tours | Call, WhatsApp, or Visit Any Office',
    seoDescription: 'Contact Al Bari Travel & Tours for Umrah, Hajj, and travel booking. Seven Regional Representatives across Pakistan and the USA, each answering personally. Call +92 315 9596161.',
    // body is dynamically built below
    body: '__CONTACT_BODY_PLACEHOLDER__',
    extraSchema: '__CONTACT_SCHEMA_PLACEHOLDER__',
  },
  {
    slug: 'glossary',
    pageName: 'Umrah & Hajj Glossary',
    pageSchemaType: 'WebPage',
    eyebrow: 'Reference',
    h1: 'Umrah, Hajj & Pilgrimage Glossary',
    lede: 'Plain-English definitions of the terms you will see in any Umrah or Hajj package — from ihram and tawaf to Saudi visa categories and aviation codes.',
    seoTitle: 'Umrah, Hajj & Pilgrimage Glossary | Al Bari Travel & Tours',
    seoDescription: `Plain-English glossary of Umrah and Hajj terms: ihram, tawaf, sa'i, miqat, Masjid al-Haram, Masjid an-Nabawi, Ziyarat, Hajj ${HAJJ_YEAR}, Saudi visa categories, and more.`,
    body: `
        <p style="opacity:0.7;margin-bottom:30px;font-size:0.9rem;">A reference for anyone booking Umrah or Hajj from Pakistan or the USA. Bookmark this page or share it with a family member preparing for their pilgrimage.</p>

        <h2 style="margin-top:30px;">Pilgrimage rites</h2>

        <div class="definition-block"><h3>Umrah</h3><p>The "minor" Islamic pilgrimage to Makkah, Saudi Arabia. Can be performed at any time of year. Consists of ihram, tawaf, sa'i, and shaving or trimming hair.</p></div>

        <div class="definition-block"><h3>Hajj</h3><p>The "major" Islamic pilgrimage, obligatory once in a lifetime for every able Muslim. Performed on specific days of Dhu'l-Hijjah. Hajj ${HAJJ_YEAR} bookings are currently open.</p></div>

        <div class="definition-block"><h3>Ihram</h3><p>The sacred state a pilgrim enters before performing Umrah or Hajj. Men wear two pieces of white unstitched cloth; women wear ordinary modest clothing. Certain everyday actions are restricted during ihram.</p></div>

        <div class="definition-block"><h3>Miqat</h3><p>One of five designated locations around Makkah where pilgrims must enter the state of ihram before proceeding. From Pakistan, most pilgrims enter ihram before landing in Jeddah or at the aircraft's miqat announcement.</p></div>

        <div class="definition-block"><h3>Tawaf</h3><p>Walking seven times anticlockwise around the Kaaba inside Masjid al-Haram. The first rite performed on arrival in Makkah.</p></div>

        <div class="definition-block"><h3>Sa'i</h3><p>Walking seven times between the hills of Safa and Marwa, performed after tawaf. Commemorates Hajar's search for water for her infant son Ismail.</p></div>

        <div class="definition-block"><h3>Ziyarat</h3><p>The visit to historical and religious sites in Madinah and around Makkah. Optional but encouraged. Includes Masjid an-Nabawi, the Battle of Uhud site, and Quba Mosque.</p></div>

        <h2 style="margin-top:40px;">Holy sites</h2>

        <div class="definition-block"><h3>Kaaba</h3><p>The cubic structure at the centre of Masjid al-Haram in Makkah. The qibla (direction of prayer) for Muslims worldwide. Pilgrims perform tawaf around it.</p></div>

        <div class="definition-block"><h3>Masjid al-Haram</h3><p>The Grand Mosque in Makkah, the largest mosque in the world. Contains the Kaaba.</p></div>

        <div class="definition-block"><h3>Masjid an-Nabawi</h3><p>The Prophet's Mosque in Madinah, the second-holiest site in Islam. Contains the tomb of Prophet Muhammad (PBUH).</p></div>

        <div class="definition-block"><h3>Mina, Arafat, Muzdalifah</h3><p>The three locations near Makkah where Hajj rites take place over five days. Pilgrims spend the day of Arafat (9th Dhu'l-Hijjah) in prayer on the Plain of Arafat.</p></div>

        <h2 style="margin-top:40px;">Saudi visa categories</h2>

        <div class="definition-block"><h3>Umrah visa</h3><p>A specific Saudi visa category for Umrah pilgrims. Valid for 30 days from entry. Issued via approved travel agents like Al Bari Travel & Tours.</p></div>

        <div class="definition-block"><h3>Hajj visa</h3><p>A specific Saudi visa category for Hajj pilgrims, issued in limited quotas per country. Only valid during the Hajj season.</p></div>

        <div class="definition-block"><h3>Tourist visa</h3><p>The Saudi e-visa launched in 2019. Can be used to perform Umrah year-round. Multiple entries, valid for one year.</p></div>

        <h2 style="margin-top:40px;">Aviation codes</h2>

        <div class="definition-block"><h3>JED — King Abdulaziz International Airport, Jeddah</h3><p>The primary entry airport for Umrah and Hajj pilgrims. Located ~80 km from Makkah.</p></div>

        <div class="definition-block"><h3>MED — Prince Mohammad bin Abdulaziz International Airport, Madinah</h3><p>The secondary entry option, used by some Umrah packages that visit Madinah first.</p></div>

        <div class="definition-block"><h3>ISB, LHE, KHI, PEW — Pakistani international airports</h3><p>ISB = Islamabad International Airport (primary for Punjab north, KP, AJK, GB). LHE = Allama Iqbal International Airport, Lahore. KHI = Jinnah International Airport, Karachi. PEW = Bacha Khan International Airport, Peshawar.</p></div>

        <h2 style="margin-top:40px;">Practical terms</h2>

        <div class="definition-block"><h3>Ziyarat tour</h3><p>A guided tour of Madinah and historical sites, typically included in our Umrah and Hajj packages.</p></div>

        <div class="definition-block"><h3>Mu'allim / Muallim</h3><p>The licensed Saudi guide assigned to each Hajj group. Coordinates logistics in Mina and Arafat.</p></div>

        <div class="definition-block"><h3>Zamzam water</h3><p>Water from the Zamzam well next to the Kaaba. Pilgrims typically bring some home. International airline allowance is usually 5 litres per traveller.</p></div>

        <h2 style="margin-top:40px;">Need help understanding a term?</h2>
        <p style="margin-top:14px;line-height:1.8;">WhatsApp <strong>Haiwad Ahmad</strong>, our Regional Branch Manager, at <a href="https://wa.me/923159596161" style="color:#c9a962;">+92 315 9596161</a>. He'll walk you through any term in Urdu, English, or Punjabi.</p>
    `,
    extraSchema: '',
  },
  {
    slug: 'thanks',
    pageName: 'Message Received',
    pageSchemaType: 'WebPage',
    eyebrow: 'Got it.',
    h1: 'Thanks — we got your message',
    lede: 'Your enquiry just landed in our inbox. Expect a reply within a few hours by email or WhatsApp.',
    seoTitle: 'Message Received | Al Bari Travel & Tours',
    seoDescription: 'Thanks for contacting Al Bari Travel & Tours. We received your message and will reply within a few hours by email or WhatsApp.',
    body: `
        <div class="trust-stats" style="margin-top:0;">
            <div class="trust-stat" style="text-align:left;">
                <div style="font-size:1.1rem;color:#c9a962;margin-bottom:8px;font-weight:600;">What happens next?</div>
                <ul class="package-features" style="margin-top:8px;font-size:0.95rem;">
                    <li>Your message is now in our queue</li>
                    <li>A Regional Representative will reply within a few hours (Mon-Sat)</li>
                    <li>You will also receive an auto-confirmation email — check spam if you do not see it</li>
                </ul>
            </div>
        </div>

        <h2 style="margin-top:40px;">Need to reach us faster?</h2>
        <p style="margin-top:14px;line-height:1.8;">For urgent enquiries — Hajj group cut-offs, departure-week visa changes, or anything you would rather not wait on — WhatsApp Haiwad Ahmad (our Regional Branch Manager) directly:</p>

        <div style="margin-top:20px;display:flex;gap:14px;flex-wrap:wrap;">
            <a href="https://wa.me/923159596161" target="_blank" rel="noopener" class="btn btn-primary">WhatsApp +92 315 9596161</a>
            <a href="tel:+923159596161" class="btn btn-secondary">Call Haiwad</a>
        </div>

        <h2 style="margin-top:40px;">While you wait — explore</h2>
        <ul class="package-features" style="margin-top:14px;">
            <li><a href="/offices/" style="color:#c9a962;">Browse our 7 Regional Representatives</a> — find the contact for your area</li>
            <li><a href="/glossary/" style="color:#c9a962;">Umrah &amp; Hajj glossary</a> — plain-English definitions of every term</li>
            <li><a href="/#packages" style="color:#c9a962;">Featured packages</a> — Economy, Premium, Family Umrah tiers</li>
        </ul>

        <p style="margin-top:40px;opacity:0.7;font-size:0.9rem;"><a href="/" style="color:#c9a962;">&larr; Back to home</a></p>
    `,
    extraSchema: '',
  },
  {
    slug: 'privacy',
    pageName: 'Privacy Policy',
    pageSchemaType: 'WebPage',
    eyebrow: 'Legal',
    h1: 'Privacy Policy',
    lede: `How Al Bari Travel & Tours collects, uses, and protects your personal information.`,
    seoTitle: 'Privacy Policy | Al Bari Travel & Tours',
    seoDescription: 'Al Bari Travel & Tours privacy policy: what information we collect, how we use it, your rights, and how to contact us about your data.',
    body: `
        <p style="opacity:0.7;margin-bottom:30px;font-size:0.9rem;">Last updated: <time datetime="${new Date().toISOString().split('T')[0]}">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time></p>

        <h2>1. Information we collect</h2>
        <p style="margin-top:14px;line-height:1.8;">When you contact Al Bari Travel & Tours by phone, WhatsApp, in person, or through this website, we collect the information you provide voluntarily. This typically includes your name, contact details (phone, WhatsApp number, email if provided), travel dates, passport details (for visa applications), and travel preferences.</p>

        <h2 style="margin-top:30px;">2. How we use your information</h2>
        <p style="margin-top:14px;line-height:1.8;">We use your information solely to provide our services — preparing quotations, booking flights and hotels, submitting Saudi visa applications, and communicating with you about your booking. We do not sell your information to third parties.</p>

        <h2 style="margin-top:30px;">3. Sharing with third parties</h2>
        <p style="margin-top:14px;line-height:1.8;">We share information with third parties only when necessary to deliver your booking: airlines, hotels, the Saudi consulate (for visas), payment processors, and ground service providers. We share only the minimum required information.</p>

        <h2 style="margin-top:30px;">4. Cookies and analytics</h2>
        <p style="margin-top:14px;line-height:1.8;">We use two analytics tools to understand site usage:</p>
        <ul class="package-features" style="margin-top:14px;">
            <li><strong>Google Analytics 4</strong> — aggregate traffic measurement (which pages are visited, which regions visitors come from). Sets first-party cookies (<code>_ga</code>, <code>_ga_*</code>). IP-address anonymisation is enabled, so your full IP is never stored.</li>
            <li><strong>Microsoft Clarity</strong> — anonymised heatmaps and session recordings that help us see how users interact with the site (where they click, scroll, get stuck). Sets cookies prefixed with <code>_clck</code> and <code>_clsk</code>. Recordings have personally-identifiable text (like form inputs) automatically masked.</li>
        </ul>
        <p style="margin-top:14px;line-height:1.8;">Both tools identify your <em>device</em>, not you personally — we never see your name, email, phone, or other identifying info via these tools. You can opt out by installing the <a href="https://tools.google.com/dlpage/gaoptout" style="color:#c9a962;" target="_blank" rel="noopener">Google Analytics opt-out browser add-on</a>, blocking cookies in your browser settings, or enabling Do Not Track. We do not use any advertising, retargeting, or fingerprinting tools.</p>

        <h2 style="margin-top:30px;">5. Data retention</h2>
        <p style="margin-top:14px;line-height:1.8;">We retain client booking records for the period required by Pakistani tax and tourism law. Passport copies and visa application data are retained only as long as needed for the active booking and then destroyed securely.</p>

        <h2 style="margin-top:30px;">6. Your rights</h2>
        <p style="margin-top:14px;line-height:1.8;">You may request a copy of the information we hold about you, ask us to correct it, or ask us to delete it (subject to legal retention requirements). To exercise any of these rights, contact us at <a href="https://wa.me/923159596161" style="color:#c9a962;">+92 315 9596161</a> or visit our <a href="/contact/" style="color:#c9a962;">Contact page</a>.</p>

        <h2 style="margin-top:30px;">7. Changes to this policy</h2>
        <p style="margin-top:14px;line-height:1.8;">We may update this policy from time to time. The "Last updated" date at the top of this page indicates when the policy was last revised. Significant changes will be communicated to active clients.</p>
    `,
    extraSchema: '',
  },
  {
    slug: 'terms',
    pageName: 'Terms of Service',
    pageSchemaType: 'WebPage',
    eyebrow: 'Legal',
    h1: 'Terms of Service',
    lede: 'The terms that govern your use of this website and any booking made through Al Bari Travel & Tours.',
    seoTitle: 'Terms of Service | Al Bari Travel & Tours',
    seoDescription: 'Al Bari Travel & Tours terms of service covering bookings, payments, cancellations, third-party providers, and limitations of liability.',
    body: `
        <p style="opacity:0.7;margin-bottom:30px;font-size:0.9rem;">Last updated: <time datetime="${new Date().toISOString().split('T')[0]}">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time></p>

        <h2>1. Acceptance of terms</h2>
        <p style="margin-top:14px;line-height:1.8;">By using this website or booking a service through Al Bari Travel & Tours, you agree to these Terms of Service. If you do not agree, please do not use our services.</p>

        <h2 style="margin-top:30px;">2. Bookings and payments</h2>
        <p style="margin-top:14px;line-height:1.8;">All bookings require a deposit to confirm. The balance is due before visa submission or ticket issuance, whichever comes first. We accept cash, bank transfer, JazzCash, and Easypaisa in Pakistan; cash, credit card, and bank transfer in the USA. Prices quoted are valid for 48 hours unless otherwise stated.</p>

        <h2 style="margin-top:30px;">3. Cancellations and refunds</h2>
        <p style="margin-top:14px;line-height:1.8;">Cancellation terms vary by package, airline, and hotel. Cancellation fees may be charged based on the supplier's rules. Saudi visa fees, once paid to the consulate, are non-refundable. Specific cancellation terms for your booking are disclosed at the time of confirmation.</p>

        <h2 style="margin-top:30px;">4. Third-party providers</h2>
        <p style="margin-top:14px;line-height:1.8;">Flights, hotels, ground transport, and visa services are provided by third parties (airlines, hotels, the Saudi government, ground operators). Al Bari Travel & Tours acts as an agent and is not liable for delays, cancellations, or changes made by third-party providers. We do, however, advocate on our clients' behalf to resolve issues.</p>

        <h2 style="margin-top:30px;">5. Travel documents</h2>
        <p style="margin-top:14px;line-height:1.8;">It is your responsibility to ensure you have a valid passport (typically 6+ months validity) and meet all entry requirements for your destination. We assist with Saudi visa applications but cannot guarantee visa approval, which is at the sole discretion of the Saudi government.</p>

        <h2 style="margin-top:30px;">6. Limitation of liability</h2>
        <p style="margin-top:14px;line-height:1.8;">Al Bari Travel & Tours' liability is limited to the value of the services you have booked through us. We are not liable for indirect or consequential losses, including loss of enjoyment.</p>

        <h2 style="margin-top:30px;">7. Governing law</h2>
        <p style="margin-top:14px;line-height:1.8;">These terms are governed by the laws of the Islamic Republic of Pakistan. Disputes will be resolved in the courts of Punjab, Pakistan, unless otherwise required by law.</p>

        <h2 style="margin-top:30px;">8. Contact</h2>
        <p style="margin-top:14px;line-height:1.8;">Questions about these terms? Reach us at <a href="https://wa.me/923159596161" style="color:#c9a962;">+92 315 9596161</a> or visit our <a href="/contact/" style="color:#c9a962;">Contact page</a>.</p>
    `,
    extraSchema: '',
  },
  {
    slug: 'why-al-bari',
    pageName: 'Why Al Bari',
    pageSchemaType: 'WebPage',
    eyebrow: 'Compare',
    h1: 'Why choose Al Bari Travel &amp; Tours',
    lede: 'Honest comparison of Al Bari vs the Pakistan Government Hajj Scheme vs typical private Pakistani operators — pricing, services, group size, and what you actually get.',
    seoTitle: 'Why Al Bari Travel — Compared to Government Hajj &amp; Other Operators',
    seoDescription: 'Honest side-by-side comparison: Al Bari Travel vs Pakistan Government Hajj Scheme vs typical private Umrah/Hajj operators. Pricing, group size, hotel quality, named-rep model.',
    body: `
        <h2 style="margin-top:0;">A 60-second summary</h2>
        <p style="margin-top:14px;line-height:1.8;">Pakistani travellers booking Umrah, Hajj, or international visas have three real options: the <strong>Pakistan Government Hajj Scheme</strong> (cheapest, lottery, basic), a <strong>typical private operator</strong> (more expensive, varies enormously in quality), or an <strong>agency like Al Bari</strong> that operates remote-first with named human representatives. None is right for everyone &mdash; this page lays out the honest trade-offs so you can pick the one that fits.</p>

        <h2 style="margin-top:50px;">Side-by-side comparison</h2>
        <table class="pricing-tier-table" style="margin-top:20px;">
            <thead>
                <tr>
                    <th>Feature</th>
                    <th>Government Hajj Scheme</th>
                    <th>Typical Private Operator</th>
                    <th>Al Bari Travel</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Booking confidence</strong></td>
                    <td>Lottery-based &mdash; no guarantee</td>
                    <td>First-come confirmed</td>
                    <td>First-come confirmed</td>
                </tr>
                <tr>
                    <td><strong>Pricing transparency</strong></td>
                    <td>Published in MoRA Policy</td>
                    <td>Often opaque; hidden upgrades</td>
                    <td>Written quote with line items</td>
                </tr>
                <tr>
                    <td><strong>Who you talk to</strong></td>
                    <td>MoRA help desk</td>
                    <td>Sales agent &rarr; back office</td>
                    <td>One named Regional Rep, start to finish</td>
                </tr>
                <tr>
                    <td><strong>Group size</strong></td>
                    <td>80&ndash;100 pilgrims per leader</td>
                    <td>40&ndash;80 typical</td>
                    <td>20&ndash;40 typical</td>
                </tr>
                <tr>
                    <td><strong>Hotel proximity to Haram</strong></td>
                    <td>Allocated &mdash; usually 600m+</td>
                    <td>Varies widely</td>
                    <td>Choose exact hotel + distance up front</td>
                </tr>
                <tr>
                    <td><strong>Visa handling</strong></td>
                    <td>Government Mu'allim system</td>
                    <td>Operator-handled</td>
                    <td>End-to-end via Pakistani agent or Nusuk Masar</td>
                </tr>
                <tr>
                    <td><strong>Airline choice</strong></td>
                    <td>Fixed (usually PIA / Saudia)</td>
                    <td>Limited</td>
                    <td>Choose: PIA, Saudia, Air Sial, FlyJinnah, Emirates</td>
                </tr>
                <tr>
                    <td><strong>Response time</strong></td>
                    <td>Days, sometimes weeks</td>
                    <td>Same-day to 3 days</td>
                    <td>Within 4 hours during Pakistan business hours</td>
                </tr>
                <tr>
                    <td><strong>Walk-in office required</strong></td>
                    <td>Yes (designated bank branches)</td>
                    <td>Usually yes (bazaar offices)</td>
                    <td>No &mdash; remote-first by phone &amp; WhatsApp</td>
                </tr>
                <tr>
                    <td><strong>USA-side support</strong></td>
                    <td>No</td>
                    <td>Rare</td>
                    <td>Texas Regional Rep (Hamid Ali)</td>
                </tr>
                <tr>
                    <td><strong>2026 Economy Umrah price</strong></td>
                    <td class="tier-price">N/A &mdash; Hajj only</td>
                    <td class="tier-price">PKR 200,000&ndash;320,000</td>
                    <td class="tier-price">PKR 235,000&ndash;290,000</td>
                </tr>
                <tr>
                    <td><strong>2027 Hajj price (Economy)</strong></td>
                    <td class="tier-price">PKR 1,150,000&ndash;1,300,000</td>
                    <td class="tier-price">PKR 1,500,000&ndash;1,950,000</td>
                    <td class="tier-price">PKR 1,500,000&ndash;1,950,000</td>
                </tr>
            </tbody>
        </table>

        <h2 style="margin-top:50px;">When the Government Scheme is the right choice</h2>
        <p style="margin-top:14px;line-height:1.8;">If your absolute top priority is cost and you're willing to accept lottery-based booking + larger group batches + less choice over hotel and airline, the Government Hajj Scheme is excellent value. We tell prospective clients this honestly &mdash; many of our team's own family members have performed Hajj through the Government Scheme.</p>

        <h2 style="margin-top:30px;">When a typical private operator is the right choice</h2>
        <p style="margin-top:14px;line-height:1.8;">For families with strong local ties to a specific bazaar operator they trust through word-of-mouth, sticking with that operator can be fine. The risk is that quality varies enormously between private operators &mdash; some are excellent, some advertise 4-star hotels and deliver 2-star ones. Always demand the exact hotel name and metres from the Haram in writing before paying.</p>

        <h2 style="margin-top:30px;">When Al Bari Travel is the right choice</h2>
        <p style="margin-top:14px;line-height:1.8;">If you value:</p>
        <ul style="margin-top:14px;line-height:2;">
            <li>A named human representative who owns your booking end-to-end (no call-centre handoffs)</li>
            <li>Written quotes with exact hotel names and distances</li>
            <li>Smaller group sizes (20&ndash;40 pilgrims per leader)</li>
            <li>Remote-first communication (no need to visit a walk-in office)</li>
            <li>Coverage across Pakistan + USA from a Pakistani-American agency</li>
            <li>Response within 4 hours during business hours</li>
            <li>Choice of airline, tier, and exact dates</li>
        </ul>
        <p style="margin-top:18px;line-height:1.8;">&hellip; then we're worth a conversation. <a href="https://wa.me/923159596161" style="color:#c9a962;">WhatsApp +92 315 9596161</a> or fill the <a href="/contact/" style="color:#c9a962;">contact form</a> for your free quote within 4 hours.</p>

        <h2 style="margin-top:50px;">What we don't offer</h2>
        <p style="margin-top:14px;line-height:2;">In the spirit of honest comparison &mdash; here's what we deliberately do NOT do:</p>
        <ul style="margin-top:14px;line-height:2;">
            <li><strong>Walk-in offices.</strong> Remote-first is our model. If you specifically need bazaar in-person service, we're not the right fit.</li>
            <li><strong>Race-to-the-bottom pricing.</strong> We don't undercut by skimping on hotel proximity or transport quality. If a quote elsewhere is 30% cheaper, ask exactly what's being cut.</li>
            <li><strong>Mass-group Hajj (100+ pilgrims per leader).</strong> Our private Hajj groups stay under 40.</li>
            <li><strong>Booking before confirmed quota.</strong> We don't sell Hajj seats we haven't confirmed yet.</li>
            <li><strong>Hotel reservations as a stand-alone service.</strong> We bundle hotels into Umrah/Hajj packages but don't separately book hotel-only stays.</li>
        </ul>

        <h2 style="margin-top:50px;">Common questions about choosing an operator</h2>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">Is Al Bari Travel licensed by MoRA?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Yes, Al Bari Travel &amp; Tours operates as a licensed Pakistani travel agency. For Hajj packages we work through the MoRA-licensed Hajj Group Operator system. Always ask any operator to show their MoRA HGO license number before paying a Hajj deposit &mdash; we welcome this verification.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">How do you keep prices fair without a walk-in office?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Walk-in offices add PKR 200,000+/month in rent + staff to an operator's overhead, which is passed to customers. We save that cost by operating remote-first via phone, WhatsApp, and email. The savings go into hotel quality and smaller group sizes, not into our pocket.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">Can I see real customer reviews?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>We're actively building our Trustpilot presence and Google Business Profile reviews. We deliberately do not display fabricated testimonials &mdash; only verified reviews from real customers will be surfaced here. In the meantime, ask us for referral phone numbers of past clients in your city; we connect prospects directly with returning pilgrims wherever possible.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">What if I'm not happy with my package?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>All issues during the trip are escalated to your Regional Representative immediately by WhatsApp. We've handled wrong-hotel placements, delayed visas, lost-passport emergencies, and medical situations &mdash; usually within hours. Pakistani Embassy in Riyadh and Consulate in Jeddah are our escalation paths for emergencies.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">How do I switch from the Government Scheme to a private package if I'm not selected?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Yes &mdash; many Pakistani applicants apply to the Government Scheme first and switch to a private operator (us or anyone else) if not selected in the December lottery. Government Scheme deposits are refundable to non-selected applicants. Don't wait until February if you're concerned about availability; private quotas often fill by then.</p></div>
        </details>

        <h2 style="margin-top:50px;">Talk to a Regional Representative now</h2>
        <p style="margin-top:14px;line-height:1.8;">WhatsApp <a href="https://wa.me/923159596161" style="color:#c9a962;">+92 315 9596161</a> for a quote within 4 hours, or browse our <a href="/services/" style="color:#c9a962;">5 service lines</a> and <a href="/offices/" style="color:#c9a962;">7 Regional Representatives</a>.</p>
    `,
    extraSchema: `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': [
    { '@type': 'Question', 'name': 'Is Al Bari Travel licensed by MoRA?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes, Al Bari Travel & Tours operates as a licensed Pakistani travel agency. For Hajj packages we work through the MoRA-licensed Hajj Group Operator system.' } },
    { '@type': 'Question', 'name': 'How do you keep prices fair without a walk-in office?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Walk-in offices add significant overhead. Remote-first operation lets us put savings into hotel quality and smaller group sizes.' } },
    { '@type': 'Question', 'name': 'Can I see real customer reviews?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'We are actively building our Trustpilot and Google Business Profile reviews and never display fabricated testimonials.' } },
    { '@type': 'Question', 'name': 'What if I am not happy with my package?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'All issues are escalated to your named Regional Representative by WhatsApp, with Pakistani embassy / consulate escalation for emergencies.' } },
    { '@type': 'Question', 'name': 'How do I switch from Government Scheme to private?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Government Scheme deposits are refundable to non-selected applicants. You can switch to a private operator at any time before the private quota fills.' } }
  ]
}, null, 2)}
</script>`,
  },
  {
    slug: 'hajj-2027',
    pageName: 'Hajj 2027 from Pakistan',
    pageSchemaType: 'WebPage',
    eyebrow: 'Hajj 2027 / 1448H',
    h1: 'Hajj 2027 from Pakistan — Complete Application Help',
    lede: 'MoRA applications open in November 2026 and the private operator quota fills fast. Get the timeline, costs, and a free alert when applications open.',
    seoTitle: 'Hajj 2027 from Pakistan — Application, Costs, MoRA Alert',
    seoDescription: 'Complete Hajj 2027 (1448H) guide for Pakistani applicants — Government Scheme vs Private route, PKR costs, application timeline, MoRA portal help, free alert when applications open in November 2026.',
    body: `
        <section style="background:rgba(201,169,98,0.08);border-left:3px solid #c9a962;padding:20px 24px;margin-bottom:30px;">
            <p style="margin:0;font-size:0.95rem;line-height:1.7;"><strong style="color:#c9a962;">Time-critical:</strong> Pakistani MoRA opens Hajj 2027 applications in <strong>November 2026</strong> (~5 months away). Quota was 179,210 in 2026; expected similar for 2027. Government Scheme is lottery-based — private quota is first-come-first-served and historically fills by February. <strong>Decide your route now.</strong></p>
        </section>

        <h2 style="margin-top:0;">Hajj 2027 — what we know so far</h2>
        <p style="margin-top:14px;line-height:1.8;">Hajj 1448H falls in <strong>late May to early June 2027</strong>. Specific dates (confirmed by moon-sighting):</p>
        <ul style="margin-top:14px;line-height:2;">
            <li><strong>Yawm at-Tarwiyah (8 Dhu al-Hijjah):</strong> approximately 26 May 2027</li>
            <li><strong>Yawm Arafah (9 Dhu al-Hijjah):</strong> approximately 27 May 2027</li>
            <li><strong>Eid al-Adha (10 Dhu al-Hijjah):</strong> approximately 28 May 2027</li>
            <li><strong>Days of Tashreeq (11&ndash;13 Dhu al-Hijjah):</strong> 29 May &ndash; 31 May 2027</li>
        </ul>
        <p style="margin-top:14px;line-height:1.8;">Pakistani Hajj flights typically depart from <strong>mid-April to mid-May 2027</strong> and return <strong>mid-June to mid-July 2027</strong>. Each pilgrim spends 35&ndash;45 days in Saudi Arabia depending on the package.</p>

        <h2 style="margin-top:50px;">Pakistani Hajj 2027 timeline — month by month</h2>
        <table class="pricing-tier-table" style="margin-top:20px;">
            <thead><tr><th>When</th><th>What happens</th></tr></thead>
            <tbody>
                <tr><td><strong>October 2026</strong></td><td>MoRA publishes Hajj Policy 2027 (cost, dates, application window)</td></tr>
                <tr><td><strong>November 2026</strong></td><td><strong>Government Scheme application window opens</strong> (typically 10&ndash;15 days)</td></tr>
                <tr><td><strong>December 2026</strong></td><td>Government Scheme lottery (Qura) draw + results published</td></tr>
                <tr><td><strong>October 2026 &ndash; February 2027</strong></td><td>Private Hajj Group Operators (HGOs) accept bookings until quota fills</td></tr>
                <tr><td><strong>January &ndash; February 2027</strong></td><td>Successful applicants pay second installment + medical screening begins</td></tr>
                <tr><td><strong>February &ndash; April 2027</strong></td><td>Document collection, Saudi visa processing, group leader briefings</td></tr>
                <tr><td><strong>Mid-April &ndash; mid-May 2027</strong></td><td>Pakistani Hajj flights depart</td></tr>
                <tr><td><strong>26 May &ndash; 31 May 2027</strong></td><td>Hajj rites (Mina &rarr; Arafah &rarr; Muzdalifah &rarr; Jamarat &rarr; Tawaf al-Ifadah)</td></tr>
                <tr><td><strong>Mid-June &ndash; mid-July 2027</strong></td><td>Pakistani Hajj flights return</td></tr>
            </tbody>
        </table>

        <h2 style="margin-top:50px;">Cost expectations for Hajj 2027</h2>
        <p style="margin-top:14px;line-height:1.8;">Expected pricing based on 2026 actuals + ~6&ndash;12% annual inflation:</p>
        <table class="pricing-tier-table" style="margin-top:20px;">
            <thead><tr><th>Route</th><th>Per Person PKR (estimated)</th><th>What you get</th></tr></thead>
            <tbody>
                <tr><td><strong>Government Hajj Scheme</strong></td><td class="tier-price">PKR 1,150,000 &ndash; 1,300,000</td><td>Lottery-based, basic services, ~80&ndash;100 pilgrims per group</td></tr>
                <tr><td><strong>Private Basic</strong></td><td class="tier-price">PKR 1,500,000 &ndash; 1,950,000</td><td>Confirmed seat, 3-star hotels, group of ~50</td></tr>
                <tr><td><strong>Private Standard</strong></td><td class="tier-price">PKR 2,000,000 &ndash; 2,500,000</td><td>4-star hotels, ~200&ndash;400m from Haram, group of ~30&ndash;40</td></tr>
                <tr><td><strong>Private Premium</strong></td><td class="tier-price">PKR 2,600,000 &ndash; 3,500,000+</td><td>5-star hotels within 200m, Aziziya private apartments, ~20&ndash;25 pilgrims</td></tr>
            </tbody>
        </table>

        <h2 style="margin-top:50px;">Three application routes — decide now</h2>
        <h3 style="margin-top:24px;">Route 1: Pakistan Government Hajj Scheme</h3>
        <p style="margin-top:8px;line-height:1.8;">Apply via the official <a href="https://hajj.mora.gov.pk/login" target="_blank" rel="noopener" style="color:#c9a962;">MoRA Hajj Portal</a> in November 2026. Cheapest option. Lottery-based &mdash; oversubscribed in recent years (in 2024, 510,000+ applied for ~90,000 government seats). <strong>If not selected, deposit refundable.</strong></p>
        <h3 style="margin-top:24px;">Route 2: Private Hajj Group Operator (HGO)</h3>
        <p style="margin-top:8px;line-height:1.8;">Book directly with a MoRA-licensed private operator (verify license number on <a href="https://mora.gov.pk/" target="_blank" rel="noopener" style="color:#c9a962;">mora.gov.pk</a>). More expensive but seat is confirmed. Operator handles full pipeline. Quality varies enormously &mdash; demand the exact Makkah hotel name + metres from Haram in writing before paying. See our <a href="/blog/government-hajj-scheme-vs-private-hajj-operators-pakistan/" style="color:#c9a962;">full comparison guide</a>.</p>
        <h3 style="margin-top:24px;">Route 3: Hybrid (apply to both)</h3>
        <p style="margin-top:8px;line-height:1.8;">Many Pakistani families apply to the Government Scheme first AND reserve a private seat. If lottery selected, cancel the private booking (most operators allow before final installment). If lottery missed, switch fully to private. Avoids the worst-case &quot;missed Hajj entirely&quot; scenario.</p>

        <h2 style="margin-top:50px;">What to prepare NOW (before November)</h2>
        <p style="margin-top:14px;line-height:1.8;">The application window is only 10&ndash;15 days. Don&apos;t scramble in November &mdash; have these ready:</p>
        <ul style="margin-top:14px;line-height:2;">
            <li><strong>Original CNIC</strong> (renew at NADRA if expiring within 12 months)</li>
            <li><strong>Original MRP / e-Passport</strong> valid through July 2027 (renew at DGI&amp;P if borderline &mdash; takes 21 working days)</li>
            <li><strong>4 passport-size photographs</strong> (white background, 4&times;6 cm, no glasses)</li>
            <li><strong>Polio booster</strong> from any government EPI centre (free, valid 28 days&ndash;12 months)</li>
            <li><strong>Meningococcal ACWY vaccination</strong> (~PKR 4,000&ndash;6,500 at private hospitals, valid 3 years)</li>
            <li><strong>Medical fitness certificate</strong> from a government hospital (required for application)</li>
            <li><strong>For women under 45:</strong> Mahram nikah-nama or NADRA FRC + notarised affidavit. See our <a href="/forms/mahram-affidavit-women-hajj-umrah/" style="color:#c9a962;">mahram affidavit guide</a>.</li>
            <li><strong>Saved-up funds</strong> for the application deposit (typically PKR 200,000 for Government Scheme)</li>
            <li><strong>Decided departure city</strong> (Lahore / Karachi / Islamabad)</li>
            <li><strong>Decided room sharing</strong> (quad / triple / double / single)</li>
        </ul>

        <section style="margin:50px 0 30px;padding:30px;background:rgba(201,169,98,0.1);border:1px solid rgba(201,169,98,0.4);border-left:4px solid #c9a962;text-align:center;">
            <p class="section-tag">Free Hajj 2027 alert</p>
            <h3 style="font-size:1.45rem;margin:6px 0 12px;">Alert me when MoRA opens Hajj 2027 applications</h3>
            <p style="opacity:0.85;margin-bottom:22px;line-height:1.7;">Drop your email below — we'll send one email the day MoRA opens applications in November 2026, with a step-by-step guide on how to apply. No spam, no other emails until then.</p>
            <form action="https://formsubmit.co/info@albaritravelspk.com" method="POST" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:560px;margin:0 auto;">
                <input type="hidden" name="_subject" value="[EMAIL SIGNUP — hajj-2027-alert] New subscriber">
                <input type="hidden" name="_template" value="table">
                <input type="hidden" name="_captcha" value="true">
                <input type="hidden" name="_autoresponse" value="Thanks! You're on the Hajj 2027 alert list. We'll email you the day MoRA opens applications in November 2026 with a step-by-step guide. Questions in the meantime? WhatsApp +92 315 9596161.">
                <input type="hidden" name="_next" value="https://www.albaritravelspk.com/thanks/">
                <input type="hidden" name="List" value="hajj-2027-alert">
                <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
                <input type="email" name="Email" required placeholder="your.email@example.com" aria-label="Email for Hajj 2027 alert" style="flex:1;min-width:240px;padding:14px 18px;font-size:1rem;background:rgba(255,255,255,0.95);border:none;color:#0d1b2a;box-sizing:border-box;">
                <button type="submit" class="btn btn-primary" style="padding:14px 26px;white-space:nowrap;">Alert me</button>
            </form>
            <p style="font-size:0.78rem;opacity:0.65;margin-top:14px;">One-time alert. Unsubscribe instantly. We never sell emails to third parties.</p>
        </section>

        <h2 style="margin-top:50px;">Common Hajj 2027 questions</h2>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">When exactly will MoRA open Hajj 2027 applications?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>MoRA typically publishes the Hajj Policy 2027 in <strong>October 2026</strong> and opens the application window in <strong>November 2026</strong> for 10&ndash;15 days. Exact dates vary &mdash; sign up below for the email alert and we&apos;ll notify you the day applications open.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">How much will Hajj 2027 cost from Pakistan?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Government Scheme is expected to be <strong>PKR 1,150,000&ndash;1,300,000</strong>. Private packages start around PKR 1,500,000 (basic) and exceed PKR 3,000,000 for premium 5-star options. Final pricing announced in MoRA Hajj Policy 2027 (October&ndash;November 2026).</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">Can I apply to both Government Scheme and private operator?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Yes &mdash; this is the &quot;hybrid&quot; route many Pakistani families use. Apply to Government Scheme in November, reserve a private seat in parallel. If the lottery selects you, cancel the private (most operators allow before final installment). If you miss the lottery, switch fully to private. Hedges against the worst-case &quot;no Hajj at all&quot; scenario.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">What if I&apos;m not selected in the Government lottery?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Your Government Scheme deposit is refundable in full &mdash; refund processing typically takes 4&ndash;8 weeks. You can then book with any MoRA-licensed private operator (subject to private quota availability). Don&apos;t wait until February &mdash; private quotas often fill by then.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">What documents do I need to start preparing now?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>CNIC (renew if expiring), MRP/e-Passport (valid through July 2027), 4 passport photos, polio + meningococcal vaccination cards, medical fitness certificate, and (for women under 45) a notarised mahram affidavit + NADRA family registration proof. Application window is short &mdash; have everything ready by mid-October 2026.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">Can a woman under 45 perform Hajj 2027 without a mahram?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>The Pakistan Government Scheme strictly requires a mahram (father, brother, husband, or son) for women under 45. Saudi has permitted women aged 45+ in supervised groups since 2021. Some private operators have additional flexibility for adult sisters travelling together &mdash; ask specifically. <a href="/forms/mahram-affidavit-women-hajj-umrah/" style="color:#c9a962;">Mahram affidavit guide</a>.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">How long is the Pakistani Hajj 2027 package?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Standard packages are 35&ndash;45 days in Saudi: Madinah ziyarah (8&ndash;10 days), Makkah pre-Hajj (5&ndash;7 days), Hajj rites (5&ndash;6 days), post-Hajj rest (3&ndash;5 days), and travel buffers. Short packages of 25&ndash;30 days exist but compress the Madinah portion significantly.</p></div>
        </details>
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">How do I verify a private Hajj operator is legitimate?</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>Visit <a href="https://mora.gov.pk/" target="_blank" rel="noopener" style="color:#c9a962;">mora.gov.pk</a> and find the published list of licensed Hajj Group Operators (HGOs). Each licensed operator has a unique license number. Cross-check this number against the operator&apos;s claim. Never pay a deposit to an operator who cannot show you their MoRA HGO license certificate.</p></div>
        </details>

        <h2 style="margin-top:50px;">How Al Bari Travel helps with Hajj 2027</h2>
        <p style="margin-top:14px;line-height:1.8;">As a MoRA-recognised travel agency, we offer:</p>
        <ul style="margin-top:14px;line-height:2;">
            <li>Government Scheme application help &mdash; we walk you through the MoRA portal during the November window and ensure documents are filed correctly</li>
            <li>Private Hajj packages from PKR 1,500,000 to PKR 3,500,000+, with confirmed seats, exact hotel names, and small group sizes (20&ndash;40 pilgrims)</li>
            <li>Hybrid strategy &mdash; we hold a private seat for you while you wait for the Government Scheme lottery result</li>
            <li>Pre-departure briefings in Urdu, Punjabi, Pashto</li>
            <li>Mahram coordination + women&apos;s group options (45+)</li>
            <li>Senior pilgrim accommodations (wheelchair-friendly, medical-friendly routing)</li>
            <li>Family multi-room booking with connecting suites</li>
        </ul>
        <p style="margin-top:18px;line-height:1.8;">WhatsApp <a href="https://wa.me/923159596161" style="color:#c9a962;">+92 315 9596161</a> for a Hajj 2027 consultation. Quote within 4 hours during Pakistan business hours.</p>

        <h2 style="margin-top:50px;">Read our full Hajj 2027 guides</h2>
        <p style="margin-top:14px;line-height:1.8;">Go deeper on the parts that matter most before you apply:</p>
        <ul style="margin-top:14px;line-height:2;">
            <li><a href="/blog/hajj-2027-from-pakistan-complete-guide/" style="color:#c9a962;">Hajj 2027 from Pakistan — complete step-by-step guide</a> — application timeline, documents, and the full process end to end.</li>
            <li><a href="/blog/how-much-does-hajj-from-pakistan-cost-2027/" style="color:#c9a962;">How much does Hajj from Pakistan cost in 2027?</a> — a real PKR breakdown by tier, what is included, and hidden costs.</li>
            <li><a href="/blog/government-hajj-scheme-vs-private-hajj-operators-pakistan/" style="color:#c9a962;">Government Hajj Scheme vs private operators</a> — which route is right for you, and how to verify a MoRA license.</li>
            <li><a href="/blog/hajj-day-by-day-rituals-pakistani-pilgrims/" style="color:#c9a962;">Hajj day-by-day rituals for Pakistani pilgrims</a> — what actually happens on each day of Hajj.</li>
        </ul>
    `,
    extraSchema: `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': [
    { '@type': 'Question', 'name': 'When will MoRA open Hajj 2027 applications?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'MoRA typically publishes Hajj Policy in October 2026 and opens the application window in November 2026 for 10–15 days.' } },
    { '@type': 'Question', 'name': 'How much will Hajj 2027 cost from Pakistan?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Government Scheme expected PKR 1,150,000–1,300,000. Private packages PKR 1,500,000–3,500,000+ depending on tier.' } },
    { '@type': 'Question', 'name': 'Can I apply to both Government and private?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes — many Pakistani families use this hybrid strategy to hedge against missing the Government Scheme lottery.' } },
    { '@type': 'Question', 'name': 'What if I am not selected in lottery?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Your Government Scheme deposit is fully refundable. You can then book with a MoRA-licensed private operator (subject to private quota availability).' } },
    { '@type': 'Question', 'name': 'How long is the Pakistani Hajj 2027 package?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Standard packages are 35–45 days in Saudi Arabia covering Madinah ziyarah, Makkah, Hajj rites, and travel.' } },
    { '@type': 'Question', 'name': 'How do I verify a private Hajj operator?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Visit mora.gov.pk and find the published list of licensed Hajj Group Operators (HGOs). Verify the operator unique license number.' } }
  ]
}, null, 2)}
</script>`,
  },
];

function buildManagePage() {
  const tpl = readTemplate('manage-page.html');
  const ctx = {
    pageName: 'Manage Booking',
    seoTitle: 'Manage Booking | Al Bari Travel',
    seoDescription: 'Manage your existing bookings directly with airlines and government portals.',
    canonical: `${site.domain}/manage/`,
    ogType: 'website',
    body: `
        <a href="https://www.airblue.com/reservations" target="_blank" rel="noopener nofollow" class="manage-card">
            <div class="manage-card-name">Airblue</div>
            <div class="manage-card-url">airblue.com/reservations &nbsp;&#8599;</div>
        </a>
    `,
  };
  writeFile('manage/index.html', render(tpl, ctx));
}

function contactPageBody() {
  const mainLines = `
        <section class="package-card" style="margin-bottom:30px;padding:28px 32px;border-color:rgba(201,169,98,0.4);background:linear-gradient(135deg,rgba(201,169,98,0.08) 0%,rgba(13,27,42,0.4) 100%);" aria-labelledby="main-lines-h">
            <h2 id="main-lines-h" style="font-size:1.4rem;margin:0 0 14px;">Main contact lines</h2>
            <p style="opacity:0.85;margin-bottom:14px;font-size:0.95rem;">Two phone numbers — either reaches our team. Both accept WhatsApp.</p>
            <p style="opacity:0.85;margin-bottom:8px;"><strong>Pakistan (Main):</strong> <a href="tel:+923159596161" style="color:#c9a962;">+92 315 9596161</a> &middot; <a href="https://wa.me/923159596161" style="color:#c9a962;" target="_blank" rel="noopener">WhatsApp</a></p>
            <p style="opacity:0.85;margin-bottom:8px;"><strong>Pakistan (Direct):</strong> <a href="tel:+923317312063" style="color:#c9a962;">+92 331 7312063</a> &middot; <a href="https://wa.me/923317312063" style="color:#c9a962;" target="_blank" rel="noopener">WhatsApp</a></p>
            <p style="opacity:0.85;margin-bottom:0;"><strong>USA:</strong> <a href="tel:+14435894441" style="color:#c9a962;">+1 (443) 589-4441</a></p>
        </section>`;
  return mainLines + offices.map(o => {
    const firstName = escapeHtml(o.incharge.split(' ')[0]);
    return `
        <section class="package-card" style="margin-bottom:18px;padding:30px 32px;" aria-labelledby="office-${o.slug}-h">
            <p style="color:#c9a962;text-transform:uppercase;letter-spacing:1.5px;font-size:0.72rem;font-weight:600;">${escapeHtml(o.country)} · ${escapeHtml(o.region)}</p>
            <h2 id="office-${o.slug}-h" style="font-size:1.4rem;margin:6px 0 18px;">${escapeHtml(o.name)}</h2>
            <p style="opacity:0.75;margin-bottom:6px;"><strong>Regional Rep:</strong> ${escapeHtml(o.incharge)}</p>
            <p style="opacity:0.75;margin-bottom:6px;"><strong>Phone:</strong> <a href="tel:${o.phoneE164}" style="color:#c9a962;" aria-label="Call ${firstName} at ${o.phoneDisplay}">${escapeHtml(o.phoneDisplay)}</a></p>
            <p style="opacity:0.75;margin-bottom:6px;"><strong>Serving:</strong> ${escapeHtml(o.city)}, ${escapeHtml(o.country)}</p>
            <p style="opacity:0.75;margin-bottom:18px;"><strong>Phone hours:</strong> ${escapeHtml(o.phoneHours || 'Mon–Sat 09:00 to 20:00')}</p>
            <div class="office-actions">
                ${o.hasWhatsapp ? `<a href="https://wa.me/${o.whatsappNumber}" target="_blank" rel="noopener" class="btn btn-primary">WhatsApp ${firstName}</a>` : ''}
                <a href="tel:${o.phoneE164}" class="btn ${o.hasWhatsapp ? 'btn-secondary' : 'btn-primary'}">Call ${firstName}</a>
                <a href="/offices/${o.slug}/" class="btn btn-secondary">Visit ${escapeHtml(o.name)} page</a>
            </div>
        </section>`;
  }).join('');
}

function contactPageSchema() {
  // One ContactPoint per office for full Organization-level contact data.
  const points = offices.map(o => ({
    '@type': 'ContactPoint',
    telephone: o.phoneE164,
    contactType: 'customer service',
    name: `${o.name} — ${o.incharge}`,
    areaServed: o.addressCountry,
    availableLanguage: o.languages,
  }));
  return `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  'mainEntity': {
    '@id': 'https://www.albaritravelspk.com/#organization',
    'contactPoint': points
  }
}, null, 2)}
</script>`;
}

function buildStaticPages() {
  const tpl = readTemplate('static-page.html');
  for (const page of STATIC_PAGES) {
    let body = page.body;
    let extraSchema = page.extraSchema;
    if (page.slug === 'contact') {
      body = contactPageBody();
      extraSchema = contactPageSchema();
    }
    const ctx = {
      pageName: page.pageName,
      pageSchemaType: page.pageSchemaType,
      eyebrow: page.eyebrow,
      h1: page.h1,
      lede: page.lede,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      canonical: `${site.domain}/${page.slug}/`,
      ogType: 'website',
      body,
      extraSchema,
      footerOfficeList: footerOfficeListHtml(),
      year: String(new Date().getFullYear()),
    };
    writeFile(`${page.slug}/index.html`, render(tpl, ctx));
  }
}

// ------------------------------------------------------------------
// Sitemap + robots
// ------------------------------------------------------------------

function buildSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const ogImage = `${site.domain}/og-default.svg`;

  // Compose all URLs with optional image entries (Google Image sitemap extension).
  const districtUrls = [];
  for (const p of provinces) {
    districtUrls.push({ loc: `${site.domain}/offices/${p.slug}/`, priority: '0.7', changefreq: 'monthly', image: ogImage, imageTitle: `Al Bari Travel & Tours in ${p.name}` });
    for (const d of p.districts) {
      if (d.linkedOfficeSlug) continue;
      districtUrls.push({
        loc: `${site.domain}/offices/${p.slug}/${d.slug}/`,
        priority: '0.6',
        changefreq: 'monthly',
        image: ogImage,
        imageTitle: `Al Bari Travel & Tours — ${d.name}, ${p.name}`,
      });
    }
  }
  const urls = [
    { loc: `${site.domain}/`, priority: '1.0', changefreq: 'weekly', image: ogImage, imageTitle: 'Al Bari Travel & Tours — Umrah, Hajj, International Flights' },
    { loc: `${site.domain}/ur/`, priority: '0.9', changefreq: 'weekly', image: ogImage, imageTitle: 'الباری ٹریول اینڈ ٹورز — اردو ورژن' },
    { loc: `${site.domain}/ur/services/`, priority: '0.85', changefreq: 'monthly', image: ogImage, imageTitle: 'ہماری خدمات — الباری ٹریول' },
    { loc: `${site.domain}/ur/services/hajj-and-umrah/`, priority: '0.85', changefreq: 'monthly', image: ogImage, imageTitle: 'حج و عمرہ پیکجز — الباری ٹریول' },
    { loc: `${site.domain}/ur/about/`, priority: '0.7', changefreq: 'yearly', image: ogImage, imageTitle: 'ہمارے بارے میں — الباری ٹریول' },
    { loc: `${site.domain}/ur/contact/`, priority: '0.8', changefreq: 'monthly', image: ogImage, imageTitle: 'رابطہ کریں — الباری ٹریول' },
    { loc: `${site.domain}/ur/offices/`, priority: '0.8', changefreq: 'monthly', image: ogImage, imageTitle: 'ہمارے دفاتر — الباری ٹریول' },
    { loc: `${site.domain}/ur/blog/`, priority: '0.75', changefreq: 'weekly', image: ogImage, imageTitle: 'بلاگ — الباری ٹریول' },
    { loc: `${site.domain}/ur/forms/`, priority: '0.75', changefreq: 'monthly', image: ogImage, imageTitle: 'فارمز — الباری ٹریول' },
    { loc: `${site.domain}/offices/`, priority: '0.9', changefreq: 'monthly', image: ogImage, imageTitle: 'Al Bari Travel & Tours offices in Pakistan and USA' },
    { loc: `${site.domain}/about/`, priority: '0.6', changefreq: 'yearly', image: ogImage, imageTitle: 'About Al Bari Travel & Tours' },
    { loc: `${site.domain}/services/`, priority: '0.9', changefreq: 'monthly', image: ogImage, imageTitle: 'Our Services — Al Bari Travel & Tours' },
    ...services.map(s => ({
      loc: `${site.domain}/services/${s.slug}/`,
      priority: '0.85',
      changefreq: 'monthly',
      image: ogImage,
      imageTitle: `${s.name} — Al Bari Travel & Tours`,
    })),
    { loc: `${site.domain}/contact/`, priority: '0.8', changefreq: 'monthly', image: ogImage, imageTitle: 'Contact Al Bari Travel & Tours' },
    { loc: `${site.domain}/blog/`, priority: '0.85', changefreq: 'weekly', image: ogImage, imageTitle: 'Al Bari Travel Blog' },
    { loc: `${site.domain}/forms/`, priority: '0.85', changefreq: 'weekly', image: ogImage, imageTitle: 'Travel & Visa Forms' },
    { loc: `${site.domain}/why-al-bari/`, priority: '0.75', changefreq: 'monthly', image: ogImage, imageTitle: 'Why Al Bari Travel — Compared' },
    { loc: `${site.domain}/hajj-2027/`, priority: '0.9', changefreq: 'monthly', image: ogImage, imageTitle: 'Hajj 2027 from Pakistan — Application Help' },
    { loc: `${site.domain}/manage/`, priority: '0.6', changefreq: 'monthly', image: ogImage, imageTitle: 'Manage Bookings — Al Bari Travel' },
    ...(readJson('diaspora-pages.json').pages.map(p => ({
      loc: `${site.domain}/${p.slug}/`,
      priority: '0.8',
      changefreq: 'monthly',
      image: ogImage,
      imageTitle: p.title,
    }))),
    ...(readJson('forms.json').forms.filter(f => f.downloadType === 'page').map(f => ({
      loc: `${site.domain}${f.downloadUrl}`,
      priority: '0.75',
      changefreq: 'monthly',
      image: ogImage,
      imageTitle: f.pageTitle || f.title,
    }))),
    ...blog.posts.map(p => ({
      loc: `${site.domain}/blog/${p.slug}/`,
      priority: '0.7',
      changefreq: 'monthly',
      image: ogImage,
      imageTitle: p.title,
    })),
    { loc: `${site.domain}/glossary/`, priority: '0.5', changefreq: 'yearly', image: ogImage, imageTitle: 'Umrah & Hajj Glossary — Al Bari Travel' },
    { loc: `${site.domain}/privacy/`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${site.domain}/terms/`, priority: '0.3', changefreq: 'yearly' },
    ...offices.map(o => ({
      loc: `${site.domain}/offices/${o.slug}/`,
      priority: '0.8',
      changefreq: 'monthly',
      image: ogImage,
      imageTitle: `${o.name} — Al Bari Travel & Tours`,
    })),
    ...districtUrls,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => {
    const imgBlock = u.image ? `
    <image:image>
      <image:loc>${u.image}</image:loc>
      <image:title>${escapeHtml(u.imageTitle || '')}</image:title>
    </image:image>` : '';
    return `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${imgBlock}
  </url>`;
  }).join('\n')}
</urlset>
`;
  writeFile('sitemap.xml', xml);
}

// =====================================================================
// URDU PAGES — RTL Pakistani Urdu version at /ur/*
// Infrastructure ready for full translation rollout. Currently builds
// only the homepage as proof-of-concept; add more templates + per-page
// translation files in data/ur/ as content gets translated.
// =====================================================================
function buildUrduPages() {
  const t = readJson('ur/translations.json');

  // Homepage
  const homeTpl = readTemplate('urdu-home.html');
  const homeCtx = {
    // SEO
    seoTitle: 'الباری ٹریول اینڈ ٹورز | پاکستان سے عمرہ، حج اور بین الاقوامی پروازیں',
    seoDescription: t.brand.shortDescription,
    // Brand
    brandName: t.brand.name,
    brandLogoHtml: `الباری <span>ٹریول اینڈ ٹورز</span>`,
    // Skip-link + nav
    skipLabel: t.common.skipToContent,
    home: t.nav.home,
    aboutLabel: t.nav.about,
    servicesLabel: t.nav.services,
    officesLabel: t.nav.offices,
    blogLabel: t.nav.blog,
    formsLabel: t.nav.forms,
    contactLabel: t.nav.contact,
    whatsappBookLabel: 'واٹس ایپ پر بک کریں',
    bookNowLabel: t.cta.bookNow,
    // Hero
    heroTag: t.hero.tag,
    heroH1: t.hero.h1,
    searchPlaceholder: t.hero.searchPlaceholder,
    searchLabel: 'سائٹ پر تلاش کریں',
    // Services section
    servicesTag: t.homepage.servicesTag,
    servicesH2: t.homepage.servicesH2,
    servicesIntro: t.homepage.servicesIntro,
    mostPopularLabel: 'سب سے مقبول',
    learnMoreLabel: t.cta.learnMore,
    // Hajj/Umrah card
    hajjUmrahTitle: 'حج و عمرہ پیکجز',
    hajjUmrahTagline: 'اقتصادی سے پریمیم تک تمام درجات',
    hajjUmrahFeat1: 'سعودی ویزا، پروازیں، ہوٹل، گراؤنڈ ٹرانسپورٹ',
    hajjUmrahFeat2: 'حرم کے قریب ہوٹل (3 تا 5 ستارہ)',
    hajjUmrahFeat3: 'تربیت یافتہ گروپ لیڈرز کے ساتھ',
    // Flights card
    flightsTitle: 'بین الاقوامی پروازیں',
    flightsTagline: 'سعودی عرب، یو اے ای، یو ایس اے، اور آگے',
    flightsFeat1: 'PIA، سعودیہ، ایئر سیال، ایمریٹس',
    flightsFeat2: 'پاکستان کے کسی بھی بڑے ایئرپورٹ سے',
    flightsFeat3: 'بہترین قیمت کا موازنہ',
    // Visas card
    visasTitle: 'ویزا سروسز',
    visasTagline: 'شینگن، یوکے، یو ایس اے، اور خلیج',
    visasFeat1: 'مکمل دستاویزات کی تیاری',
    visasFeat2: 'سفارت خانے کی بکنگ',
    visasFeat3: 'ویزا منظوری کے امکانات بہتر بنانے پر مشاورت',
    // Trust strip
    trustTag: t.homepage.trustTag,
    trustH2: t.homepage.trustH2,
    trustReps: t.trust.regionalReps,
    trustRepsSub: t.trust.regionalRepsSub,
    trustDistricts: t.trust.districts,
    trustDistrictsSub: t.trust.districtsSub,
    trustYear: t.trust.yearEstablished,
    trustYearSub: t.trust.yearSub,
    trustLanguages: t.trust.languages,
    trustLanguagesSub: t.trust.languagesSub,
    trustNote: t.homepage.trustNote,
    aboutLink: 'ہمارے کام کے بارے میں مزید پڑھیں ←',
    // Contact
    contactTag: t.homepage.contactTag,
    contactH2: t.homepage.contactH2,
    contactSub: t.homepage.contactSub,
    whatsAppCta: 'واٹس ایپ',
    callCta: 'کال کریں',
    // Footer
    footerTagline: t.footer.tagline,
    footerExplore: t.footer.explore,
    footerContact: t.footer.contact,
    whatsAppLine: t.contact.whatsappLine,
    directLine: t.contact.directLine,
    usaLine: t.contact.usaLine,
    allRights: t.footer.allRights,
    tagline: t.brand.tagline,
    // Float CTA + mobile
    whatsAppAria: 'واٹس ایپ پر چیٹ کریں',
    quickContactLabel: 'فوری رابطہ',
    whatsAppMobile: 'واٹس ایپ',
    callMobile: 'کال',
  };
  writeFile('ur/index.html', render(homeTpl, homeCtx));

  // /ur/services/hajj-and-umrah/
  writeFile('ur/services/hajj-and-umrah/index.html', render(readTemplate('urdu-hajj-umrah.html'), {
    seoTitle: 'حج و عمرہ پیکجز 2026-2027 | الباری ٹریول اینڈ ٹورز',
    seoDescription: 'پاکستان سے حج اور عمرہ کے مکمل پیکجز — سعودی ویزا، پروازیں، حرم کے قریب ہوٹل، گراؤنڈ ٹرانسپورٹ اور زیارات۔ اقتصادی سے پریمیم تک تمام درجات۔',
    canonical: 'https://www.albaritravelspk.com/ur/services/hajj-and-umrah/',
    enEquivalent: 'https://www.albaritravelspk.com/services/hajj-and-umrah/',
    ogType: 'website',
    _lang: 'ur',
  }));

  // /ur/contact/
  writeFile('ur/contact/index.html', render(readTemplate('urdu-contact.html'), {
    seoTitle: 'رابطہ کریں | الباری ٹریول اینڈ ٹورز',
    seoDescription: 'الباری ٹریول اینڈ ٹورز سے رابطہ کریں — 7 ریجنل نمائندے، پاکستان (+92 315 9596161) اور امریکہ (+1 443 589 4441)۔ واٹس ایپ، فون، یا ای میل۔',
    canonical: 'https://www.albaritravelspk.com/ur/contact/',
    enEquivalent: 'https://www.albaritravelspk.com/contact/',
    ogType: 'website',
    _lang: 'ur',
  }));

  // /ur/about/
  writeFile('ur/about/index.html', render(readTemplate('urdu-about.html'), {
    seoTitle: 'ہمارے بارے میں | الباری ٹریول اینڈ ٹورز — خاندانی پاکستانی سفری ادارہ',
    seoDescription: 'الباری ٹریول اینڈ ٹورز — 2018 سے قائم خاندانی سفری ادارہ۔ سات ریجنل نمائندے پاکستان اور امریکہ میں خدمات سرانجام دے رہے ہیں۔ ریموٹ-فرسٹ، شفاف۔',
    canonical: 'https://www.albaritravelspk.com/ur/about/',
    enEquivalent: 'https://www.albaritravelspk.com/about/',
    ogType: 'website',
    _lang: 'ur',
  }));

  // /ur/services/
  writeFile('ur/services/index.html', render(readTemplate('urdu-services-landing.html'), {
    seoTitle: 'ہماری خدمات | الباری ٹریول اینڈ ٹورز — 5 سفری سروسز پاکستان سے',
    seoDescription: 'الباری ٹریول اینڈ ٹورز کی 5 سفری سروسز — حج اور عمرہ، بین الاقوامی پروازیں، طالب علم ویزا، ویزٹ ویزا، خلیجی ورک ویزا۔ ایک ہی ادارہ، متعین نمائندے۔',
    canonical: 'https://www.albaritravelspk.com/ur/services/',
    enEquivalent: 'https://www.albaritravelspk.com/services/',
    ogType: 'website',
    _lang: 'ur',
  }));

  // /ur/offices/
  writeFile('ur/offices/index.html', render(readTemplate('urdu-offices-landing.html'), {
    seoTitle: 'ہمارے دفاتر | الباری ٹریول — 7 ریجنل نمائندے پاکستان اور امریکہ',
    seoDescription: 'الباری ٹریول کے 7 ریجنل نمائندے — حسن ابدال (مرکزی ہب)، راولپنڈی، ٹیکسلا، صوابی، مردان، پشاور، اور ٹیکساس (امریکہ)۔ ریموٹ-فرسٹ، 170 پاکستانی اضلاع تک رسائی۔',
    canonical: 'https://www.albaritravelspk.com/ur/offices/',
    enEquivalent: 'https://www.albaritravelspk.com/offices/',
    ogType: 'website',
    _lang: 'ur',
  }));

  // /ur/blog/
  writeFile('ur/blog/index.html', render(readTemplate('urdu-blog-landing.html'), {
    seoTitle: 'بلاگ | الباری ٹریول — پاکستانی مسافروں کے لیے گائیڈز',
    seoDescription: 'پاکستان سے عمرہ، حج 2027، سعودی ویزا، UK طالب علم ویزا، شینگن، GAMCA میڈیکل اور خلیجی ورک ویزا پر تحقیقاتی گائیڈز۔ 20+ گہرے گائیڈز۔',
    canonical: 'https://www.albaritravelspk.com/ur/blog/',
    enEquivalent: 'https://www.albaritravelspk.com/blog/',
    ogType: 'website',
    _lang: 'ur',
  }));

  // /ur/forms/
  writeFile('ur/forms/index.html', render(readTemplate('urdu-forms-landing.html'), {
    seoTitle: 'فارمز | الباری ٹریول — پاکستانی سفری اور ویزا فارمز',
    seoDescription: 'حج 2027 درخواست، عمرہ بکنگ چیک لسٹ، محرم حلف نامہ، سعودی Umrah ویزا، Schengen، UK طالب علم ویزا، GAMCA — 18 فارمز پاکستانی مسافروں کے لیے۔',
    canonical: 'https://www.albaritravelspk.com/ur/forms/',
    enEquivalent: 'https://www.albaritravelspk.com/forms/',
    ogType: 'website',
    _lang: 'ur',
  }));
}

// Diaspora landing pages (UK / USA / Canada)
function buildDiasporaPages() {
  const data = readJson('diaspora-pages.json');
  const tpl = readTemplate('diaspora-page.html');
  for (const page of data.pages) {
    const flightsTableHtml = page.flights.map(f => `
                <tr>
                    <td><strong>${escapeHtml(f.route)}</strong></td>
                    <td>${escapeHtml(f.airlines)}</td>
                    <td class="tier-price">${escapeHtml(f.approxFare)}</td>
                    <td style="font-size:0.9em;opacity:0.8;">${escapeHtml(f.duration)}</td>
                </tr>`).join('');
    const pricingKey = `pricing${page.currency}`;
    const pricingRows = (page[pricingKey] || []);
    const pricingTableHtml = pricingRows.map(t => `
                <tr>
                    <td><strong>${escapeHtml(t.tier)}</strong></td>
                    <td class="tier-price">${escapeHtml(t.range)}</td>
                    <td style="font-size:0.9em;opacity:0.85;">${escapeHtml(t.highlights)}</td>
                </tr>`).join('');
    const communitiesHtml = page.communities.map(c => `<span style="background:rgba(201,169,98,0.1);border:1px solid rgba(201,169,98,0.3);padding:6px 14px;color:#c9a962;font-size:0.85rem;">${escapeHtml(c)}</span>`).join('');
    const considerationsHtml = page.uniqueConsiderations.map(c => `<li>${c}</li>`).join('\n');
    const faqHtml = page.faqs.map(q => `
        <details class="faq-item" style="margin-top:14px;">
            <summary><h3 style="display:inline;margin:0;font-size:1.05rem;">${escapeHtml(q.q)}</h3><span class="faq-toggle" aria-hidden="true">+</span></summary>
            <div class="faq-answer"><p>${escapeHtml(q.a)}</p></div>
        </details>`).join('');
    const faqSchema = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': page.faqs.map(q => ({
    '@type': 'Question',
    name: q.q,
    acceptedAnswer: { '@type': 'Answer', text: q.a }
  }))
}, null, 2)}
</script>`;

    const ctx = {
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      canonical: `${site.domain}/${page.slug}/`,
      ogType: 'article',
      title: page.title,
      audience: page.audience,
      country: page.country,
      currency: page.currency,
      intro: page.intro,
      flightsTableHtml,
      pricingTableHtml,
      communitiesHtml,
      considerationsHtml,
      faqHtml,
      faqSchema,
      name: page.title,
      footerOfficeList: footerOfficeListHtml(),
      year: String(new Date().getFullYear()),
    };
    writeFile(`${page.slug}/index.html`, render(tpl, ctx));
  }
}

// Build a lightweight client-side search index
function buildSearchIndex() {
  const entries = [];
  const ogImage = `${site.domain}/og-default.svg`;

  // Static landing pages
  const staticEntries = [
    { u: '/', t: 'Home — Al Bari Travel & Tours', d: 'Trusted Umrah, Hajj, and international flight booking from Pakistan and USA. Seven Regional Representatives.', k: 'home umrah hajj saudi flights pakistan' },
    { u: '/about/', t: 'About Al Bari Travel & Tours', d: 'Family-run agency established 2018. Remote-first model with named Regional Representatives.', k: 'about company history founder' },
    { u: '/services/', t: 'Our Services', d: 'Hajj & Umrah packages, international flights, student/visit/work visas.', k: 'services' },
    { u: '/offices/', t: 'Our Offices', d: 'Seven Regional Representatives serving Pakistan and the USA.', k: 'offices locations representatives' },
    { u: '/contact/', t: 'Contact Us', d: 'WhatsApp +92 315 9596161, +92 331 7312063, USA +1 (443) 589-4441, info@albaritravelspk.com', k: 'contact phone email whatsapp' },
    { u: '/blog/', t: 'Blog — Pakistani Travel Guides', d: '20+ research-backed guides on Umrah, Hajj, Saudi visa, UK student visa, Schengen, Gulf work.', k: 'blog guides articles' },
    { u: '/forms/', t: 'Travel & Visa Forms Library', d: '18 curated Pakistani travel forms — Hajj 2027 application, Saudi e-visa checklist, GAMCA centres.', k: 'forms documents templates downloads' },
    { u: '/why-al-bari/', t: 'Why Al Bari Travel — Honest Comparison', d: 'Side-by-side comparison with Government Hajj Scheme and typical private operators.', k: 'compare vs government scheme private' },
    { u: '/glossary/', t: 'Umrah & Hajj Glossary', d: 'Definitions of Tawaf, Sa\'i, Miqat, Ihram, Mahram, Talbiyah and 40+ pilgrimage terms.', k: 'glossary terms definitions tawaf sai' },
  ];
  entries.push(...staticEntries);

  // Services
  for (const s of services) {
    entries.push({
      u: `/services/${s.slug}/`,
      t: s.name,
      d: s.seoDescription || s.heroLede || '',
      k: (s.tags || []).join(' ') + ' service',
    });
  }

  // Offices
  for (const o of offices) {
    entries.push({
      u: `/offices/${o.slug}/`,
      t: o.name,
      d: o.intro || '',
      k: `${o.city} ${o.region} ${o.country} office representative ${o.incharge}`,
    });
  }

  // Provinces
  for (const p of provinces) {
    entries.push({
      u: `/offices/${p.slug}/`,
      t: `Al Bari Travel in ${p.name}`,
      d: `Umrah, Hajj, and international travel services across ${p.name}, Pakistan.`,
      k: `${p.name} pakistan province`,
    });
  }

  // Blog posts
  for (const post of blog.posts) {
    entries.push({
      u: `/blog/${post.slug}/`,
      t: post.title,
      d: post.excerpt || post.seoDescription || '',
      k: (post.tags || []).join(' ') + ' ' + post.category,
    });
  }

  // Forms library entries
  const forms = readJson('forms.json').forms;
  for (const f of forms) {
    entries.push({
      u: f.downloadType === 'page' ? f.downloadUrl : `/forms/#form-${f.slug}`,
      t: f.title.replace(/&amp;/g, '&'),
      d: f.description.replace(/<[^>]+>/g, '').slice(0, 200),
      k: (f.tags || []).join(' ') + ' form',
    });
  }

  writeFile('search-index.json', JSON.stringify(entries));
}

// ------------------------------------------------------------------
// Auto-refresh hardcoded year references in index.html + llms.txt so
// that running `node scripts/build-pages.js` keeps the WHOLE site
// in sync with the current Hajj year — not just generated pages.
//
// Known Hajj date windows (approximate, walks earlier ~11 days/year):
// ------------------------------------------------------------------
const HAJJ_DATES = {
  2026: { start: '2026-05-25', end: '2026-05-30' },
  2027: { start: '2027-05-14', end: '2027-05-19' },
  2028: { start: '2028-05-04', end: '2028-05-09' },
  2029: { start: '2029-04-23', end: '2029-04-28' },
  2030: { start: '2030-04-13', end: '2030-04-18' },
  2031: { start: '2031-04-02', end: '2031-04-07' },
  2032: { start: '2032-03-22', end: '2032-03-27' },
};

function refreshHardcodedYears() {
  const dates = HAJJ_DATES[HAJJ_YEAR];
  if (!dates) {
    console.warn(`  WARNING: no Hajj date window for ${HAJJ_YEAR} — extend HAJJ_DATES table. Skipping year refresh.`);
    return;
  }

  // ---- index.html ----
  const indexPath = path.join(ROOT, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  // Hajj 20XX in text + JSON-LD string values
  indexHtml = indexHtml.replace(/Hajj 20\d{2}/g, `Hajj ${HAJJ_YEAR}`);
  // Umrah 20XX in knowsAbout
  indexHtml = indexHtml.replace(/Umrah 20\d{2}/g, `Umrah ${CURRENT_YEAR}`);
  // Event schema dates
  indexHtml = indexHtml.replace(/"startDate":\s*"20\d{2}-0[3-6]-\d{2}"/g, `"startDate": "${dates.start}"`);
  indexHtml = indexHtml.replace(/"endDate":\s*"20\d{2}-0[3-6]-\d{2}"/g, `"endDate": "${dates.end}"`);
  fs.writeFileSync(indexPath, indexHtml);
  console.log(`  index.html refreshed → Hajj ${HAJJ_YEAR} (${dates.start} to ${dates.end}), Umrah ${CURRENT_YEAR}`);

  // ---- llms.txt ----
  const llmsPath = path.join(ROOT, 'llms.txt');
  let llmsTxt = fs.readFileSync(llmsPath, 'utf8');
  llmsTxt = llmsTxt.replace(/Hajj 20\d{2}/g, `Hajj ${HAJJ_YEAR}`);
  llmsTxt = llmsTxt.replace(/Umrah 20\d{2}/g, `Umrah ${CURRENT_YEAR}`);
  fs.writeFileSync(llmsPath, llmsTxt);
  console.log(`  llms.txt refreshed`);
}

// ------------------------------------------------------------------
// CSS minification — zero-dependency, conservative.
// Strips comments, collapses whitespace around { } : ; , > + ~ , and
// removes the last semicolon before }. Preserves "foo: bar" strings
// inside content: "..." declarations.
// ------------------------------------------------------------------
function minifyCss() {
  const src = fs.readFileSync(path.join(ROOT, 'css/main.css'), 'utf8');
  // Protect 'content: "..."' string values so we don't strip whitespace from them.
  const strings = [];
  let working = src.replace(/(["'])((?:\\.|(?!\1).)*)\1/g, (m) => {
    strings.push(m);
    return `__STR_${strings.length - 1}__`;
  });
  // Strip /* … */ comments.
  working = working.replace(/\/\*[\s\S]*?\*\//g, '');
  // Collapse all runs of whitespace to a single space.
  working = working.replace(/\s+/g, ' ');
  // Remove space around structural chars.
  working = working.replace(/\s*([{}:;,>+~])\s*/g, '$1');
  // Drop trailing semicolons before closing braces.
  working = working.replace(/;}/g, '}');
  // Restore strings.
  working = working.replace(/__STR_(\d+)__/g, (_, i) => strings[+i]);
  // Restore a couple of mandatory spaces (e.g. after media query keyword).
  working = working.replace(/@(media|supports|keyframes|font-face)/g, ' @$1 ').trim();

  writeFile('css/main.min.css', working);
  const before = src.length, after = working.length;
  const saved = ((1 - after/before) * 100).toFixed(1);
  console.log(`  minified ${before} → ${after} bytes (-${saved}%)`);
}

function buildRobots() {
  // Explicit-allow per-bot. Most permissive for trusted crawlers, slight crawl-delay
  // hint to defaults so we don't get hammered by long-tail bots on 183 pages.
  const txt = `# Al Bari Travel & Tours — robots.txt
# Crawl rules. Sitemap below.

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Slurp
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: LinkedInBot
Allow: /

User-agent: WhatsApp
Allow: /

User-agent: *
Allow: /
Disallow: /404
Crawl-delay: 1

Sitemap: ${site.domain}/sitemap.xml
`;
  writeFile('robots.txt', txt);
}

// ------------------------------------------------------------------
// Run
// ------------------------------------------------------------------

const target = process.argv[2] || 'all';
console.log(`build-pages: target=${target}`);

if (target === 'all' || target === 'offices') {
  console.log('building offices...');
  buildOfficesLanding();
  offices.forEach(buildOfficePage);
}

if (target === 'all' || target === 'provinces') {
  console.log('building provinces + districts...');
  for (const province of provinces) {
    buildProvincePage(province);
    for (const district of province.districts) {
      buildDistrictPage(province, district);
    }
  }
}

if (target === 'all' || target === 'static') {
  console.log('building static pages (about, contact, privacy, terms)...');
  buildStaticPages();
}

if (target === 'all' || target === 'manage') {
  console.log('building manage booking page (minimal, no footer)...');
  buildManagePage();
}

if (target === 'all' || target === 'services') {
  console.log('building services landing + individual service pages...');
  buildServicesLanding();
  services.forEach(buildServicePage);
}

if (target === 'all' || target === 'blog') {
  console.log('building blog landing + individual posts...');
  buildBlogLanding();
  blog.posts.forEach(buildBlogPost);
}

if (target === 'all' || target === 'forms') {
  console.log('building forms library page + per-form info pages...');
  buildFormsPage();
  buildFormInfoPages();
}

if (target === 'all' || target === 'diaspora') {
  console.log('building diaspora landing pages (UK / USA / Canada)...');
  buildDiasporaPages();
}

if (target === 'all' || target === 'urdu') {
  console.log('building Urdu pages (RTL, Noto Nastaliq)...');
  buildUrduPages();
}

if (target === 'all' || target === 'sitemap') {
  console.log('building sitemap + robots...');
  buildSitemap();
  buildRobots();
}

if (target === 'all' || target === 'search') {
  console.log('building search index...');
  buildSearchIndex();
}

if (target === 'all' || target === 'css') {
  console.log('minifying CSS...');
  minifyCss();
}

if (target === 'all' || target === 'years') {
  console.log('refreshing hardcoded years in index.html + llms.txt...');
  refreshHardcodedYears();
}

if (target === 'all' || target === 'sweep') {
  console.log('post-build sweep (lazy-load + dims + last-updated)...');
  require('child_process').execSync(`node "${path.join(__dirname, 'post-build-sweep.js')}"`, { stdio: 'inherit' });
}

console.log('done.');
