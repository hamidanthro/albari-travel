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
  return `        <a class="office-card-link province-card-link" href="/offices/${province.slug}/" aria-label="View ${province.name} coverage">
            <article class="office-card-static province-card-static">
                <span class="office-city">${escapeHtml(province.country)} &middot; Province</span>
                <h3>${escapeHtml(province.name)}</h3>
                <p class="office-card-meta">${escapeHtml(province.tagline)}</p>
                <p class="office-card-meta"><strong>${province.districts.length} districts</strong> served</p>
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
  return `        <a class="district-card-link" href="${href}" aria-label="View ${escapeHtml(district.name)} district">
            <article class="${cardClass}">
                <span class="district-card-badge">${badge}</span>
                <h3>${escapeHtml(district.name)}</h3>
                <span class="district-card-cta">View &rarr;</span>
            </article>
        </a>`;
}

function buildProvincePage(province) {
  const tpl = readTemplate('province.html');
  const ctx = {
    name: province.name,
    country: province.country,
    tagline: province.tagline,
    districtCount: String(province.districts.length),
    canonical: `${site.domain}/offices/${province.slug}/`,
    seoTitle: province.seoTitle,
    seoDescription: province.seoDescription,
    ogType: 'website',
    districtCards: province.districts.map(d => districtCardHtml(province, d)).join('\n'),
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile(`offices/${province.slug}/index.html`, render(tpl, ctx));
}

function buildDistrictPage(province, district) {
  if (district.linkedOfficeSlug) return; // real office already has its own page
  const tpl = readTemplate('district.html');
  const bm = site.defaultBranchManager;
  const ctaButtons = [];
  if (bm.hasWhatsapp) {
    ctaButtons.push(`<a href="https://wa.me/${bm.whatsappNumber}" target="_blank" rel="noopener" class="btn btn-primary">WhatsApp ${escapeHtml(bm.incharge.split(' ')[0])}</a>`);
  }
  ctaButtons.push(`<a href="tel:${bm.phoneE164}" class="btn ${bm.hasWhatsapp ? 'btn-secondary' : 'btn-primary'}">Call ${escapeHtml(bm.incharge.split(' ')[0])}</a>`);

  const intro = `Al Bari Travel & Tours serves ${district.name} district in ${province.name}, Pakistan through our regional branch network. Your dedicated contact for Umrah, Hajj, and international travel inquiries from ${district.name} is ${bm.incharge}, ${bm.title}, reachable directly by phone or WhatsApp.`;

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
    seoTitle: `Al Bari Travel and Tours ${district.name} | Umrah, Hajj & Flight Booking`,
    seoDescription: `Al Bari Travel & Tours serving ${district.name}, ${province.name}, Pakistan. Umrah & Hajj packages, international flight booking, and visa processing. Contact ${bm.incharge}, ${bm.title}: ${bm.phoneDisplay}.`,
    ogType: 'place',
    ctaButtons: ctaButtons.map(b => '                    ' + b).join('\n'),
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
    openingHoursDisplay: office.openingHours.replace('Mo-Sa', 'Mon–Sat').replace('-', ' to '),
    languagesDisplay: office.languages.join(' · '),
    ctaButtons: ctaButtonsHtml(office),
    serviceList: serviceListHtml(office),
    otherOfficeCards: others.map(officeCardHtml).join('\n'),
    footerOfficeList: footerOfficeListHtml(),
    year: String(new Date().getFullYear()),
  };
  writeFile(`offices/${office.slug}/index.html`, render(tpl, ctx));
}

// ------------------------------------------------------------------
// Sitemap + robots
// ------------------------------------------------------------------

function buildSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const districtUrls = [];
  for (const p of provinces) {
    districtUrls.push({ loc: `${site.domain}/offices/${p.slug}/`, priority: '0.7', changefreq: 'monthly' });
    for (const d of p.districts) {
      if (d.linkedOfficeSlug) continue;
      districtUrls.push({ loc: `${site.domain}/offices/${p.slug}/${d.slug}/`, priority: '0.6', changefreq: 'monthly' });
    }
  }
  const urls = [
    { loc: `${site.domain}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${site.domain}/offices/`, priority: '0.9', changefreq: 'monthly' },
    ...offices.map(o => ({
      loc: `${site.domain}/offices/${o.slug}/`,
      priority: '0.8',
      changefreq: 'monthly',
    })),
    ...districtUrls,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  writeFile('sitemap.xml', xml);
}

function buildRobots() {
  const txt = `User-agent: *
Allow: /

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

if (target === 'all' || target === 'sitemap') {
  console.log('building sitemap + robots...');
  buildSitemap();
  buildRobots();
}

console.log('done.');
