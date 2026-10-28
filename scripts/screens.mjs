// Capture screenshots of the main screens on phone and desktop.
//   node scripts/screens.mjs <baseUrl> <prefix> [--legacy]
// The redesigned flow resets the dev server's fictional data first (/__dev/reset).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [base = 'http://localhost:5173', prefix = 'after'] = process.argv.slice(2);
const legacy = process.argv.includes('--legacy');
const outDir = 'docs/screenshots';
fs.mkdirSync(outDir, { recursive: true });

const viewports = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch({ channel: 'chrome' });
if (!legacy) await fetch(base + '/__dev/reset', { method: 'POST' }).catch(() => {});

for (const [name, vp] of Object.entries(viewports)) {
  for (const scheme of legacy ? ['light'] : ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch, colorScheme: scheme });
    const page = await ctx.newPage();
    const suffix = scheme === 'dark' ? '-dark' : '';
    const shot = (label) => page.screenshot({ path: `${outDir}/${prefix}-${name}${suffix}-${label}.png` });
    await page.goto(base + '/');
    await page.waitForTimeout(legacy ? 3500 : 2200);
    await shot('1-board');

    const opener = legacy ? page.locator('.patient-card').first() : page.locator('[data-testid="patient-open"]').first();
    if (await opener.count()) {
      await opener.click();
      await page.waitForTimeout(900);
      await shot('2-patient');
    }
    if (legacy || scheme === 'dark') { await ctx.close(); continue; }

    // Symptoms dialog over the sheet
    await page.locator('.tile.t-sym').click();
    await page.waitForTimeout(600);
    await shot('3-symptoms');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    if (name === 'mobile') {
      await page.locator('.bottom-nav').getByRole('button', { name: 'More' }).click();
      await page.waitForTimeout(500);
      await shot('4-menu');
      await page.keyboard.press('Escape');
    } else {
      await page.locator('#btn-pharmacy-mode').click();
      await page.waitForTimeout(600);
      await shot('4-pharmacy');
      await page.locator('#btn-rounds-mode').click();
    }

    await page.locator('#search-input').evaluate(el => { el.value = ''; });
    await page.goto(base + '/');
    await page.waitForTimeout(1500);
    if (name === 'mobile') await page.locator('.topbar').getByRole('button', { name: 'Settings' }).click();
    else await page.locator('.sidebar-foot .icon-btn').click();
    await page.waitForTimeout(500);
    await shot('5-settings');
    await ctx.close();
  }
}
await browser.close();
console.log('screenshots written to', outDir);
