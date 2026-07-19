// Regenerates gallery/social-preview.png, the page's social card: captures
// each Showcase's galaxy from dist/, composes social-card.html, and renders
// it at 1200x630. Run `ruby gallery/build.rb` first so dist/ is current.
//
//   node gallery/social_preview.mjs
//
// Needs the repo's JS dev dependencies (`npm ci`) for Playwright, and macOS
// `sips` for the final downscale from the retina capture.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const GALLERY = path.dirname(fileURLToPath(import.meta.url));
const SLUGS = ['rubocop', 'rails', 'discourse', 'rubygems-org'];
const TILES = path.join(GALLERY, 'social-tiles');
fs.mkdirSync(TILES, { recursive: true });

const browser = await chromium.launch();
const tileContext = await browser.newContext({ viewport: { width: 1000, height: 760 } });
for (const slug of SLUGS) {
  const page = await tileContext.newPage();
  await page.goto(`file://${path.join(GALLERY, 'dist', `${slug}-showcase.html`)}`);
  await page.addStyleTag({ content: '.masthead, .cinema-annotation { display: none !important; }' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(TILES, `${slug}.png`) });
  await page.close();
  console.log(`tile ${slug}`);
}

const cardContext = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
const page = await cardContext.newPage();
await page.goto(`file://${path.join(GALLERY, 'social-card.html')}`);
await page.waitForTimeout(600);
const out = path.join(GALLERY, 'social-preview.png');
await page.screenshot({ path: out });
await browser.close();
execFileSync('sips', ['-z', '630', '1200', out], { stdio: 'ignore' });
console.log(`wrote ${out}`);
