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

function buildOfficesLanding() {
  const tpl = readTemplate('offices-landing.html');
  const ctx = {
    seoTitle: 'Our Offices | Al Bari Travel & Tours — Pakistan & USA Locations',
    seoDescription: 'Al Bari Travel & Tours offices in Hasan Abdal, Pakistan and Texas, USA. Trusted Umrah, Hajj, and luxury travel packages from two locations.',
    canonical: `${site.domain}/offices/`,
    ogType: 'website',
    officeCards: offices.map(officeCardHtml).join('\n'),
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
  const urls = [
    { loc: `${site.domain}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${site.domain}/offices/`, priority: '0.9', changefreq: 'monthly' },
    ...offices.map(o => ({
      loc: `${site.domain}/offices/${o.slug}/`,
      priority: '0.8',
      changefreq: 'monthly',
    })),
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

if (target === 'all' || target === 'sitemap') {
  console.log('building sitemap + robots...');
  buildSitemap();
  buildRobots();
}

console.log('done.');
