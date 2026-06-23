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

function render(tpl, ctx) {
  // Inline partials first ({{>name}})
  let out = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => readPartial(name));
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

// Nearest international airport per district — meaningful entity signal for SEO + real
// info for the user. Mapping is by region + a few district overrides for major hubs.
function nearestAirport(province, district) {
  // Per-district overrides where a major airport sits in that district.
  const overrides = {
    'lahore':            { code: 'LHE', name: 'Allama Iqbal International Airport, Lahore' },
    'multan':            { code: 'MUX', name: 'Multan International Airport' },
    'faisalabad':        { code: 'LYP', name: 'Faisalabad International Airport' },
    'sialkot':           { code: 'SKT', name: 'Sialkot International Airport' },
    'rahim-yar-khan':    { code: 'RYK', name: 'Sheikh Zayed International Airport, Rahim Yar Khan' },
    'karachi-central':   { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'karachi-east':      { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'karachi-south':     { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'karachi-west':      { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'kemari':            { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'korangi':           { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'malir':             { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'sukkur':            { code: 'SKZ', name: 'Sukkur Airport' },
    'gwadar':            { code: 'GWD', name: 'Gwadar International Airport' },
    'quetta':            { code: 'UET', name: 'Quetta International Airport' },
    'turbat':            { code: 'TUK', name: 'Turbat International Airport' },
    'kech':              { code: 'TUK', name: 'Turbat International Airport' },
    'skardu':            { code: 'KDU', name: 'Skardu International Airport' },
    'gilgit':            { code: 'GIL', name: 'Gilgit Airport' },
  };
  if (overrides[district.slug]) return overrides[district.slug];

  // Province-level defaults.
  const defaults = {
    'punjab':              { code: 'ISB', name: 'Islamabad International Airport' },
    'sindh':               { code: 'KHI', name: 'Jinnah International Airport, Karachi' },
    'khyber-pakhtunkhwa':  { code: 'PEW', name: 'Bacha Khan International Airport, Peshawar' },
    'balochistan':         { code: 'UET', name: 'Quetta International Airport' },
    'islamabad':           { code: 'ISB', name: 'Islamabad International Airport' },
    'azad-kashmir':        { code: 'ISB', name: 'Islamabad International Airport' },
    'gilgit-baltistan':    { code: 'ISB', name: 'Islamabad International Airport' },
    'united-states':       { code: 'IAH', name: 'George Bush Intercontinental Airport, Houston' },
  };
  return defaults[province.slug] || { code: 'ISB', name: 'Islamabad International Airport' };
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
    `Pilgrims and travellers in ${district.name}, ${province.name} have a direct line to Al Bari Travel & Tours via ${bm.incharge}, our ${bm.title}. Reach out for Umrah and Hajj packages, Saudi Arabia visa documentation, flight booking from ${airportInfo.name} (${airportInfo.code}), and group departure coordination — all handled remotely by phone and WhatsApp.`,
    `For families and individuals in ${district.name} planning Umrah, Hajj 2027, or international travel, Al Bari Travel & Tours offers complete branch-network service. ${bm.incharge} (${bm.title}) handles enquiries personally from our ${bm.regionalHubLocation} hub — package quotes, Saudi visa applications, flights from ${airportInfo.name} (${airportInfo.code}), and hotel bookings in Makkah and Madinah.`,
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
    { q: `Can a group from ${district.name} travel together for Hajj 2027?`, a: `Yes — group Hajj from ${district.name} is one of the most popular services we coordinate. We arrange synchronised departure dates, group hotels in Makkah (near Masjid al-Haram) and Madinah (near Masjid an-Nabawi), shared ground transport, and a single point of contact through ${bm.incharge}. Minimum group size is typically 8 people, but smaller family groups are also supported. Hajj 2027 booking is open — reach out early for the best hotel inventory.` },
    { q: `What payment options does Al Bari Travel accept from ${district.name} clients?`, a: `We accept cash, bank transfer, JazzCash, and Easypaisa from clients in ${district.name}. Bookings are confirmed once a deposit is received; the balance is due before the visa submission. ${bm.incharge} will walk you through the schedule on the first call.` },
    { q: `Does Al Bari Travel arrange airport transfers from ${district.name} to ${airportInfo.name}?`, a: `Most pilgrims from ${district.name} fly out of ${airportInfo.name} (${airportInfo.code}). We coordinate pickup arrangements where possible; specific routes and rates are confirmed once your booking is finalised. Contact ${bm.incharge} at ${bm.phoneDisplay} to discuss.` },
    { q: `Are family Umrah packages available for ${district.name} pilgrims?`, a: `Yes. Many of our ${district.name} clients travel as family groups — couples, parents with adult children, multi-generational. We tailor hotel categories near the Haram in Makkah and Madinah, room types, and Ziyarat tour pacing to suit the family. ${bm.incharge} can suggest packages once we understand the group composition.` },
    { q: `What is the best time of year to book Umrah from ${district.name}?`, a: `Umrah from ${district.name} runs year-round. Off-peak months (mid-September through October, late February through April) offer the best rates and least crowded conditions in Makkah. Ramadan and the weeks around Hajj are most expensive. ${bm.incharge} can advise on the optimal window for your situation.` },
    { q: `What is the cheapest Umrah package available from ${district.name}?`, a: `Economy Umrah packages from ${district.name} start at the lowest tier we offer — typically a 10-day trip with 3-star hotel accommodation a short walk from the Haram, shared transport, and round-trip flights from ${airportInfo.name}. Exact pricing varies by season and dates. WhatsApp ${bm.incharge} at ${bm.phoneDisplay} for a live quote.` },
    { q: `Do I need to be in Hasan Abdal to book through Al Bari Travel?`, a: `No. ${district.name} clients can book entirely remotely. Our team in ${bm.regionalHubLocation} handles your application, visa, and ticketing end-to-end. Documents are shared via WhatsApp or email; the only thing you collect in person (if you wish) is the final visa stamping — and even that we can courier where possible.` },
    { q: `Which airlines do you book for Umrah flights from ${district.name}?`, a: `From ${airportInfo.name} (${airportInfo.code}) we book PIA (Pakistan International Airlines), Saudi Airlines (Saudia), Air Sial, AirBlue, Qatar Airways, and Emirates depending on departure date and budget. Most Umrah pilgrims from ${district.name} fly direct or with a single stopover.` },
    { q: `What is included in an Al Bari Travel Umrah package from ${district.name}?`, a: `A standard Umrah package from ${district.name} includes: return international flights, Saudi e-visa, hotel accommodation in Makkah (near Masjid al-Haram) and Madinah (near Masjid an-Nabawi), ground transport between cities, guided Ziyarat tour of historical Islamic sites, and full in-country support. Meals, Zamzam water, and laundry are typically extra unless you select a premium package.` },
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
        <p style="margin-top:14px;line-height:1.8;">Al Bari Travel & Tours is a family-run travel agency serving the Pakistani and Pakistani-American community since our founding. We coordinate Umrah, Hajj, and international flight bookings with a personal touch — every client is matched with a named branch manager who handles their journey end-to-end.</p>

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

        <h2 style="margin-top:40px;">What we do</h2>
        <ul class="package-features" style="margin-top:14px;">
            <li><strong>Umrah Packages</strong> — economy through premium tiers, year-round departures, group and family options</li>
            <li><strong>Hajj Packages</strong> — coordinated group departures with full logistics, accommodation near the Haram, guided rites</li>
            <li><strong>International Flight Booking</strong> — Saudi Arabia, UAE, USA, and beyond from any major Pakistani airport</li>
            <li><strong>Saudi Visa Processing</strong> — documentation, submission, and tracking, all handled by our team</li>
            <li><strong>Group Travel Arrangements</strong> — extended families, mosque groups, community trips</li>
        </ul>

        <h2 style="margin-top:40px;">How we're organised</h2>
        <p style="margin-top:14px;line-height:1.8;">Al Bari Travel runs as a <strong>remote-first agency</strong>. We don't operate brick-and-mortar storefronts. Instead, we work through <strong>named Regional Representatives</strong> who each cover a part of Pakistan or the USA:</p>
        <ul class="package-features" style="margin-top:14px;">
            <li><strong>Hasan Abdal (Punjab)</strong> — Haiwad Ahmad, our Regional Branch Manager and the central hub for all bookings</li>
            <li><strong>Rawalpindi (Punjab)</strong> — Maaz Ali</li>
            <li><strong>Taxila (Punjab)</strong> — Jawad Ahmad</li>
            <li><strong>Swabi (KP)</strong> — Yawar Hayat</li>
            <li><strong>Mardan (KP)</strong> — Muhammad Huzaifa</li>
            <li><strong>Peshawar (KP)</strong> — Faisal Khan</li>
            <li><strong>Texas (USA)</strong> — Hamid Ali, serving the Pakistani-American community</li>
        </ul>
        <p style="margin-top:14px;line-height:1.8;">Beyond our 7 Regional Representatives, our remote agent network serves <strong>every district of Pakistan — all 170 of them</strong> — entirely by phone, WhatsApp, and email.</p>

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
    lede: 'Every office has a named branch manager who answers your call personally. Pick the office nearest you, or WhatsApp our main line for an immediate response.',
    seoTitle: 'Contact Al Bari Travel & Tours | Call, WhatsApp, or Visit Any Office',
    seoDescription: 'Contact Al Bari Travel & Tours for Umrah, Hajj, and travel booking. Seven offices across Pakistan and the USA, each with a named branch manager. Call +92 315 9596161 or WhatsApp.',
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
    seoDescription: "Plain-English glossary of Umrah and Hajj terms: ihram, tawaf, sa'i, miqat, Masjid al-Haram, Masjid an-Nabawi, Ziyarat, Hajj 2027, Saudi visa categories, and more.",
    body: `
        <p style="opacity:0.7;margin-bottom:30px;font-size:0.9rem;">A reference for anyone booking Umrah or Hajj from Pakistan or the USA. Bookmark this page or share it with a family member preparing for their pilgrimage.</p>

        <h2 style="margin-top:30px;">Pilgrimage rites</h2>

        <div class="definition-block"><h3>Umrah</h3><p>The "minor" Islamic pilgrimage to Makkah, Saudi Arabia. Can be performed at any time of year. Consists of ihram, tawaf, sa'i, and shaving or trimming hair.</p></div>

        <div class="definition-block"><h3>Hajj</h3><p>The "major" Islamic pilgrimage, obligatory once in a lifetime for every able Muslim. Performed on specific days of Dhu'l-Hijjah. Hajj 2027 falls in mid-May 2027.</p></div>

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
];

function contactPageBody() {
  return offices.map(o => {
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
    { loc: `${site.domain}/offices/`, priority: '0.9', changefreq: 'monthly', image: ogImage, imageTitle: 'Al Bari Travel & Tours offices in Pakistan and USA' },
    { loc: `${site.domain}/about/`, priority: '0.6', changefreq: 'yearly', image: ogImage, imageTitle: 'About Al Bari Travel & Tours' },
    { loc: `${site.domain}/contact/`, priority: '0.8', changefreq: 'monthly', image: ogImage, imageTitle: 'Contact Al Bari Travel & Tours' },
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

if (target === 'all' || target === 'sitemap') {
  console.log('building sitemap + robots...');
  buildSitemap();
  buildRobots();
}

if (target === 'all' || target === 'css') {
  console.log('minifying CSS...');
  minifyCss();
}

console.log('done.');
