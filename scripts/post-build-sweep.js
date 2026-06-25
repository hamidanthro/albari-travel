#!/usr/bin/env node
/**
 * post-build-sweep.js — runs after build-pages.js to apply mechanical perf
 * improvements that are tedious to do in every template:
 *
 *   1. Add loading="lazy" + decoding="async" to every <img> below the fold
 *      (skips the first <img> per page since that's typically the LCP image)
 *   2. Add width/height defaults to known image dimensions (Unsplash CDN
 *      images already encode w= and h= in their URLs — extract those)
 *   3. Insert a "Last updated: <today>" line under each page's H1
 *      (skips: pages that already have one; pages with no H1; the homepage)
 *
 * Run: node scripts/post-build-sweep.js
 * Auto-run from build-pages.js when target=all.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TODAY = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Urdu month names + numeral-localised date
const UR_MONTHS = ['جنوری','فروری','مارچ','اپریل','مئی','جون','جولائی','اگست','ستمبر','اکتوبر','نومبر','دسمبر'];
const NOW = new Date();
const TODAY_UR = `${NOW.getUTCDate()} ${UR_MONTHS[NOW.getUTCMonth()]} ${NOW.getUTCFullYear()}`;

// Skip these top-level paths entirely
const SKIP_PATHS = new Set(['node_modules', 'scripts', 'data', 'templates', 'css', 'fonts', '.git', 'build']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_PATHS.has(entry.name) || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(p);
  }
  return files;
}

function lazyLoadAndDims(html) {
  let imgCount = 0;
  return html.replace(/<img\b([^>]*)>/g, (m, attrs) => {
    imgCount += 1;
    // Skip if already has loading attribute
    if (/\bloading=/.test(attrs)) return m;
    // First image per page = LCP candidate, don't lazy-load
    let newAttrs = attrs;
    if (imgCount > 1) {
      newAttrs = newAttrs + ' loading="lazy" decoding="async"';
    } else {
      newAttrs = newAttrs + ' decoding="async" fetchpriority="high"';
    }
    // Extract width/height from Unsplash URL query string if missing
    const hasWidth = /\bwidth=/.test(newAttrs);
    const hasHeight = /\bheight=/.test(newAttrs);
    if (!hasWidth || !hasHeight) {
      const srcMatch = newAttrs.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        const u = srcMatch[1];
        const wm = u.match(/[?&]w=(\d+)/);
        const hm = u.match(/[?&]h=(\d+)/);
        if (wm && !hasWidth) newAttrs += ` width="${wm[1]}"`;
        if (hm && !hasHeight) newAttrs += ` height="${hm[1]}"`;
      }
    }
    return `<img${newAttrs}>`;
  });
}

function addLastUpdated(html, relPath) {
  // Skip homepage and 404
  if (relPath === 'index.html' || relPath === '404.html') return html;
  // Skip if already has one
  if (/data-last-updated/.test(html)) return html;
  // Detect Urdu pages (path starts with ur/) — use Urdu label + Urdu month name
  const isUr = relPath.startsWith('ur/') || /<html[^>]+lang=["']ur["']/.test(html);
  // Find first <h1>...</h1> in <main>; insert "Last updated" line after it
  const mainIdx = html.indexOf('<main');
  if (mainIdx < 0) return html;
  const h1Re = /(<h1[^>]*>[\s\S]*?<\/h1>)/;
  const match = h1Re.exec(html.slice(mainIdx));
  if (!match) return html;
  const insertAt = mainIdx + match.index + match[0].length;
  const stamp = isUr
    ? `\n<p class="last-updated" data-last-updated="${TODAY_UR}" lang="ur" dir="rtl" style="font-family:'Noto Nastaliq Urdu',sans-serif;font-size:0.85rem;opacity:0.6;margin-top:8px;margin-bottom:0;text-align:right;">آخری بار اپ ڈیٹ: ${TODAY_UR}</p>`
    : `\n<p class="last-updated" data-last-updated="${TODAY}" style="font-size:0.78rem;opacity:0.55;letter-spacing:1px;text-transform:uppercase;margin-top:8px;margin-bottom:0;">Last updated: ${TODAY}</p>`;
  return html.slice(0, insertAt) + stamp + html.slice(insertAt);
}

function main() {
  const files = walk(ROOT);
  let touched = 0;
  let imgsTouched = 0;
  let datesTouched = 0;
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    const before = fs.readFileSync(abs, 'utf8');
    let after = before;

    // 1. lazy-load + dimensions
    const imgsBefore = (after.match(/<img\b/g) || []).length;
    after = lazyLoadAndDims(after);
    const lazyAdded = (after.match(/loading="lazy"/g) || []).length - (before.match(/loading="lazy"/g) || []).length;
    if (lazyAdded > 0) imgsTouched += lazyAdded;

    // 2. last-updated stamp
    const beforeDate = after;
    after = addLastUpdated(after, rel);
    if (after !== beforeDate) datesTouched += 1;

    if (after !== before) {
      fs.writeFileSync(abs, after);
      touched += 1;
    }
  }
  console.log(`post-build sweep: ${touched} files touched, ${imgsTouched} images lazy-loaded, ${datesTouched} 'Last updated' stamps added`);
}

main();
