// Regenerates gallery/social-preview.png, the page's social card: captures
// each Showcase's galaxy from dist/ via the runtime's deterministic clip
// frame hook, composes social-card.html, and renders it at 1200x630.
// Run `ruby gallery/build.rb` first so dist/ is current.
//
//   node gallery/social_preview.mjs
//
// Needs the repo's JS dev dependencies (`npm ci`) for Playwright. Set
// RUBYLENS_CHROME to capture with a specific Chrome/Chromium binary instead
// of Playwright's managed one. Tiles are pixel-stable: every galaxy is
// frozen at the same clip frame (t=3s) instead of sampling live animation.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const GALLERY = path.dirname(fileURLToPath(import.meta.url));
const SLUGS = ['rubocop', 'rails', 'discourse', 'rubygems-org'];
const TILES = path.join(GALLERY, 'social-tiles');
const TILE_FRAME = 90; // frame 90 at 30fps = the galaxy three seconds into its turn
const TILE_FPS = 30;
fs.mkdirSync(TILES, { recursive: true });

const executablePath = process.env.RUBYLENS_CHROME;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const tileContext = await browser.newContext({ viewport: { width: 1000, height: 760 } });
for (const slug of SLUGS) {
  const page = await tileContext.newPage();
  await page.goto(`file://${path.join(GALLERY, 'dist', `${slug}-showcase.html`)}`);
  await page.addStyleTag({ content: '.masthead, .cinema-annotation { display: none !important; }' });
  // Interval polling with a generous timeout: a large galaxy under software
  // WebGL can take a while to first frame, and its render loop starves
  // requestAnimationFrame-based polling.
  await page.waitForFunction(() => document.documentElement.dataset.showcaseReady === 'true', undefined, { timeout: 120_000, polling: 500 });
  const status = await page.evaluate(() => beginShowcaseClip().status);
  if (status !== 'ok') throw new Error(`${slug}: clip capture unavailable (${status})`);
  await page.evaluate(([frame, fps]) => renderShowcaseClipFrame(frame, fps), [TILE_FRAME, TILE_FPS]);
  await page.screenshot({ path: path.join(TILES, `${slug}.png`) });
  await page.close();
  console.log(`tile ${slug}`);
}

const cardContext = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
const card = await cardContext.newPage();
await card.goto(`file://${path.join(GALLERY, 'social-card.html')}`);
await card.waitForFunction(() =>
  document.fonts.status === 'loaded' && [...document.images].every(image => image.complete && image.naturalWidth > 0),
undefined, { timeout: 30_000, polling: 250 });
// scale: 'css' downsamples the deviceScaleFactor 2 render to 1200x630 in the
// browser, replacing the macOS-only sips step.
const out = path.join(GALLERY, 'social-preview.png');
await card.screenshot({ path: out, scale: 'css' });
await browser.close();
console.log(`wrote ${out}`);
