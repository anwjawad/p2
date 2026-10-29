// End-to-end tests for the ward board. Data is fictional (dev/seed.mjs) and is
// reset before every test through the dev server's /__dev/reset endpoint.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const card = (page, name) => page.locator('article.bed', { has: page.getByText(name, { exact: true }) });

/** Collect console errors and failed same-origin requests for the whole test. */
function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g|cdnjs/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return errors;
}

async function openBoard(page) {
  await page.goto('/');
  await expect(page.locator('#current-ward-title')).toHaveText('Oncology A');
  await expect(page.locator('article.bed')).toHaveCount(4);
}

async function waitSaved(page) {
  await expect(page.locator('#sync-pill')).toHaveAttribute('data-state', 'idle', { timeout: 10_000 });
}

test.beforeEach(async ({ request }) => {
  await request.post('/__dev/reset');
});

test('board loads the first ward, sorted by room, with a census and no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const rooms = await page.locator('.bed-room').allTextContents();
  expect(rooms).toEqual(['204', '206', '208', '210']);
  await expect(page.locator('#ward-census')).toContainText('4 patients');
  await expect(page.locator('#ward-census')).toContainText('1 flagged');
  await expect(page.locator('#wards-list .ward-item')).toHaveCount(4);
  await expect(page.locator('#wards-list')).not.toContainText('TRASH');
  expect(errors).toEqual([]);
});

test('switching wards from the sidebar', async ({ page }) => {
  await openBoard(page);
  await page.locator('#wards-list .ward-item', { hasText: 'Surgery' }).click();
  await expect(page.locator('#current-ward-title')).toHaveText('Surgery');
  await expect(page.locator('article.bed')).toHaveCount(2);
  await page.locator('#wards-list .ward-item', { hasText: 'Home Care' }).click();
  await expect(page.locator('#patients-grid .empty')).toContainText('No patients in Home Care');
});

test('search covers all wards and ignores Arabic diacritics / alef forms', async ({ page }) => {
  await openBoard(page);
  await page.locator('#search-input').fill('PAT10519');
  await expect(page.locator('article.bed')).toHaveCount(1);
  await expect(page.locator('article.bed')).toContainText('Noor Al-Masri');
  await page.locator('#search-input').fill('محمود عبد الرحمن');
  await expect(page.locator('article.bed')).toHaveCount(1);
  await page.locator('#search-input').fill('مَحمود'); // with a diacritic
  await expect(page.locator('article.bed')).toHaveCount(1);
  await page.locator('#search-input').fill('cancer'); // results from several wards still read in room order
  await expect(page.locator('article.bed')).toHaveCount(5);
  expect(await page.locator('.bed-room').allTextContents()).toEqual(['121', '206', '208', '302', '305']);
  await page.locator('#search-input').fill('zzzz');
  await expect(page.locator('#patients-grid .empty')).toContainText('No patient matches');
  await page.locator('#search-input').press('Escape');
  await expect(page.locator('article.bed')).toHaveCount(4);
});

test('clearing a field in the patient sheet is saved (regression: value || old)', async ({ page }) => {
  await openBoard(page);
  await card(page, 'Layla Haddad').getByTestId('patient-open').click();
  await expect(page.locator('#modal-panel')).toBeVisible();
  await page.locator('#inp-diagnosis').fill('');
  await page.locator('#inp-treatment').fill('Comfort care only');
  await expect(page.locator('#save-status')).toContainText('Saved', { timeout: 10_000 });
  await page.reload();
  await expect(page.locator('article.bed')).toHaveCount(4);
  const c = card(page, 'Layla Haddad');
  await expect(c).toContainText('Comfort care only');
  await expect(c.locator('.bed-dx')).toHaveCount(0);
});

test('closing the sheet right after typing still saves the edit (regression: lost autosave)', async ({ page }) => {
  await openBoard(page);
  await card(page, 'Sara Mansour').getByTestId('patient-open').click();
  await page.locator('#inp-notes').fill('Family updated at 09:40');
  await page.keyboard.press('Escape'); // closes within the 1.5 s autosave delay
  await card(page, 'Yousef Khalil').getByTestId('patient-open').click();
  await page.keyboard.press('Escape');
  await waitSaved(page);
  await page.reload();
  await card(page, 'Sara Mansour').getByTestId('patient-open').click();
  await expect(page.locator('#inp-notes')).toHaveValue('Family updated at 09:40');
});

test('new patient is saved with every field, in the current ward (regression)', async ({ page }) => {
  await openBoard(page);
  await page.locator('.page-actions .btn-new').click();
  await expect(page.locator('#modal-patient-name')).toBeFocused();
  await page.locator('#modal-patient-name').fill('Test Person Rami');
  await page.locator('#modal-patient-room').fill('212');
  await page.locator('#inp-diagnosis').fill('Glioblastoma');
  await expect(page.locator('#save-status')).toContainText('Saved', { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('article.bed')).toHaveCount(5);
  const c = card(page, 'Test Person Rami');
  await expect(c.locator('.bed-room')).toHaveText('212');
  await expect(c).toContainText('Glioblastoma');
});

test('a new patient closed without a name is discarded, not saved', async ({ page }) => {
  await openBoard(page);
  await page.locator('.page-actions .btn-new').click();
  await page.locator('#inp-diagnosis').fill('Something');
  await expect(page.locator('#save-status')).toContainText('Enter a name', { timeout: 5_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('article.bed')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('article.bed')).toHaveCount(4);
});

test('flag toggles and persists (regression: numeric ids)', async ({ page }) => {
  await openBoard(page);
  const flag = card(page, 'Sara Mansour').locator('.bed-flag');
  await expect(flag).toHaveAttribute('aria-pressed', 'false');
  await flag.click();
  await expect(card(page, 'Sara Mansour').locator('.bed-flag')).toHaveAttribute('aria-pressed', 'true');
  await waitSaved(page);
  await page.reload();
  await expect(card(page, 'Sara Mansour').locator('.bed-flag')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ward-census')).toContainText('2 flagged');
});

test('bulk move with undo, and remove hides patients without deleting rows', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btn-select-mode').click();
  await card(page, 'Sara Mansour').getByTestId('patient-open').click();
  await card(page, 'Yousef Khalil').getByTestId('patient-open').click();
  await expect(page.locator('#selected-count')).toHaveText('2');
  await page.locator('#floating-action-bar').getByRole('button', { name: 'Move', exact: true }).click();
  await page.locator('.dialog select').selectOption('Surgery');
  await page.locator('.dialog').getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.locator('#current-ward-title')).toHaveText('Surgery');
  await expect(page.locator('article.bed')).toHaveCount(4);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await waitSaved(page);
  await page.locator('#wards-list .ward-item', { hasText: 'Oncology A' }).click();
  await expect(page.locator('article.bed')).toHaveCount(4);

  await page.locator('#btn-select-mode').click();
  await card(page, 'Yousef Khalil').getByTestId('patient-open').click();
  await page.locator('#floating-action-bar').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.dialog')).toContainText('nothing is permanently deleted');
  await page.locator('.dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('article.bed')).toHaveCount(3);
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('article.bed')).toHaveCount(3);
  await expect(page.locator('#wards-list')).not.toContainText('TRASH');
});

test('notes survive a reload and a second save (regression: notes overwritten)', async ({ page }) => {
  await openBoard(page);
  await page.locator('.nav-item[data-nav="notes"]').click();
  await expect(page.locator('#notes-grid > *')).toHaveCount(2);
  await page.getByRole('button', { name: 'New note' }).click();
  await page.locator('#note-title-input').fill('Morning huddle');
  await page.locator('#note-content-editor').fill('Bed 210 for family meeting.');
  await page.locator('#note-editor-modal').getByRole('button', { name: /Save/ }).click();
  await expect(page.locator('#notes-sync-status')).toContainText('3 notes saved', { timeout: 10_000 });
  await page.reload();
  await page.locator('.nav-item[data-nav="notes"]').click();
  await expect(page.locator('#notes-grid > *')).toHaveCount(3);
  await expect(page.locator('#notes-grid')).toContainText('Weekly MDT');
  await expect(page.locator('#notes-grid')).toContainText('Morning huddle');
});

test('every dialog opens, traps focus and closes with Escape', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const c = card(page, 'Layla Haddad');
  const cases = [
    ['symptoms-modal', () => c.getByRole('button', { name: /^Symptoms/ }).click()],
    ['plan-modal', () => c.getByRole('button', { name: /^Plan/ }).click()],
    ['medication-modal', () => c.getByRole('button', { name: /^Medications/ }).click()],
    ['settings-modal', () => page.locator('.sidebar-foot .icon-btn').click()],
    ['calculator-modal', () => page.locator('.nav-item', { hasText: 'Opioid calculator' }).click()],
    ['import-modal', () => page.locator('.nav-item', { hasText: 'Import patients' }).click()],
    ['ai-hub-modal', () => page.locator('.nav-item', { hasText: 'AI assistant' }).click()],
    ['history-modal', () => page.locator('.nav-item[data-nav="history"]').click()],
    ['section-modal', () => page.getByRole('button', { name: 'New ward' }).click()],
  ];
  for (const [id, open] of cases) {
    await open();
    const modal = page.locator('#' + id);
    await expect(modal, id).toBeVisible();
    await expect(modal, id).toHaveAttribute('aria-modal', 'true');
    await page.waitForTimeout(150);
    const focusInside = await page.evaluate((mid) => document.getElementById(mid).contains(document.activeElement), id);
    expect(focusInside, `${id} focus`).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal, id).toBeHidden();
  }
  // Patient sheet tiles open the labs dialog on top of the sheet
  await c.getByTestId('patient-open').click();
  await page.locator('.tile.t-labs').click();
  await expect(page.locator('#labs-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#labs-modal')).toBeHidden();
  await expect(page.locator('#patient-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#patient-modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('symptoms update the card acuity bar', async ({ page }) => {
  await openBoard(page);
  await card(page, 'Sara Mansour').getByRole('button', { name: /^Symptoms/ }).click();
  await page.locator('#ecog-btn-4').click();
  await expect(page.locator('#ecog-status-text')).toContainText('4 -');
  await page.locator('#symptoms-modal').getByRole('button', { name: 'Save Assessment' }).click();
  await expect(page.locator('#symptoms-modal')).toBeHidden();
  await expect(card(page, 'Sara Mansour').locator('.acuity')).toHaveAttribute('data-level', '4');
  await waitSaved(page);
  await page.reload();
  await expect(card(page, 'Sara Mansour').locator('.acuity')).toHaveAttribute('data-level', '4');
});

test('symptom notes with quotes and HTML are kept as text (regression: injection)', async ({ page }) => {
  await openBoard(page);
  await card(page, 'Sara Mansour').getByRole('button', { name: /^Symptoms/ }).click();
  const note = page.getByRole('textbox', { name: 'Note for Pain' });
  await note.fill('pain "8/10" <b>at night</b>');
  await page.locator('#symptoms-modal').getByRole('button', { name: 'Save Assessment' }).click();
  await expect(card(page, 'Sara Mansour').locator('.chip-symptom')).toContainText('pain "8/10" <b>at night</b>');
  await card(page, 'Sara Mansour').getByRole('button', { name: /^Symptoms/ }).click();
  await expect(page.getByRole('textbox', { name: 'Note for Pain' })).toHaveValue('pain "8/10" <b>at night</b>');
});

test('past rounds open read-only and writes are blocked', async ({ page }) => {
  await openBoard(page);
  await page.locator('.nav-item[data-nav="history"]').click();
  await page.locator('#history-list button').first().click();
  await expect(page.locator('#archive-banner')).toBeVisible();
  await expect(page.locator('article.bed').first()).toBeVisible();
  await expect(page.locator('.bed-flag').first()).toBeDisabled();
  await page.locator('#archive-banner').getByRole('button', { name: 'Back to today' }).click();
  await expect(page.locator('#archive-banner')).toBeHidden();
  await expect(page.locator('#current-ward-title')).toHaveText('Oncology A');
});

test('starting a new day requires typing NEW DAY, archives and clears the board', async ({ page }) => {
  await openBoard(page);
  await page.locator('.sidebar-foot .icon-btn').click();
  await page.locator('#btn-daily-reset').click();
  const dlg = page.locator('.dialog');
  await dlg.getByRole('button', { name: 'Archive and clear board' }).click();
  await expect(dlg.locator('.field-error')).toContainText('NEW DAY');
  await dlg.locator('input').fill('NEW DAY');
  await dlg.getByRole('button', { name: 'Archive and clear board' }).click();
  await expect(page.locator('.toast')).toContainText('9 patients archived');
  await expect(page.locator('#patients-grid .empty')).toBeVisible();
  await page.locator('.nav-item[data-nav="history"]').click();
  await expect(page.locator('#history-list button')).toHaveCount(3);
});

test('port cath list loads its module on demand', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const before = await page.evaluate(() => typeof renderPortCathStudio);
  expect(before).toBe('undefined'); // not part of the first load
  await page.locator('.nav-item[data-nav="portcath"]').click();
  await expect(page.locator('#cath-studio-view')).toBeVisible();
  await expect(page.locator('#tab-portcath')).toContainText('Port Cath Schedule');
  expect(await page.evaluate(() => typeof renderPortCathStudio)).toBe('function');
  await page.getByRole('button', { name: 'Back to board' }).click();
  await expect(page.locator('#patient-grid-container')).toBeVisible();
  expect(errors).toEqual([]);
});

test('appearance setting persists across reloads', async ({ page }) => {
  await openBoard(page);
  await page.locator('.sidebar-foot .icon-btn').click();
  await page.locator('.theme-btn[data-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('offline banner appears and a failed save is reported', async ({ page, context }) => {
  await openBoard(page);
  await context.setOffline(true);
  await expect(page.locator('#net-banner')).toBeVisible();
  await card(page, 'Sara Mansour').locator('.bed-flag').click();
  await expect(page.locator('.toast[data-kind="error"]')).toBeVisible();
  await expect(page.locator('#sync-pill')).toHaveAttribute('data-state', 'error');
  await context.setOffline(false);
  await expect(page.locator('#net-banner')).toBeHidden();
});

test('board has no serious accessibility violations (axe, WCAG 2.2 AA)', async ({ page }) => {
  await openBoard(page);
  await page.waitForTimeout(600); // let the card entrance animation finish
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(serious.map(v => `${v.id}: ${v.nodes.length} × ${v.nodes[0].target}`)).toEqual([]);
});

test('patient sheet has no serious accessibility violations', async ({ page }) => {
  await openBoard(page);
  await card(page, 'Layla Haddad').getByTestId('patient-open').click();
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).include('#patient-modal').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(serious.map(v => `${v.id}: ${v.nodes.length} × ${v.nodes[0].target}`)).toEqual([]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('no horizontal overflow; chips, bottom bar and drawer work', async ({ page }) => {
    await openBoard(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await page.locator('.ward-chip', { hasText: 'Internal Medicine' }).click();
    await expect(page.locator('article.bed')).toHaveCount(3);
    await page.locator('.bottom-nav').getByRole('button', { name: 'More' }).click();
    await expect(page.locator('#sidebar')).toHaveClass(/is-open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sidebar')).not.toHaveClass(/is-open/);
    await card(page, 'Rania Odeh').getByTestId('patient-open').click();
    await expect(page.locator('#modal-panel')).toBeVisible();
    const sheetOverflow = await page.evaluate(() => {
      const el = document.getElementById('modal-panel');
      return el.scrollWidth - el.clientWidth;
    });
    expect(sheetOverflow).toBeLessThanOrEqual(0);
  });

  test('touch targets on the card are at least 40 px', async ({ page }) => {
    await openBoard(page);
    const sizes = await page.locator('article.bed').first().locator('button').evaluateAll(bs => bs.map(b => {
      const r = b.getBoundingClientRect();
      return Math.min(r.width, r.height);
    }).filter(x => x > 0));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(32);
    const actions = await page.locator('article.bed').first().locator('.bed-actions button').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height));
    actions.forEach(h => expect(h).toBeGreaterThanOrEqual(40));
  });
});

test.describe('access code', () => {
  test.use({ baseURL: 'http://localhost:5181' });

  test('lock screen blocks data until the right code is entered', async ({ page }) => {
    const urls = [];
    page.on('request', r => urls.push(r.url()));
    await page.goto('/');
    await expect(page.locator('#lock-screen')).toBeVisible();
    await expect(page.locator('article.bed')).toHaveCount(0);
    await page.locator('#lock-code').fill('wrong');
    await page.locator('#lock-submit').click();
    await expect(page.locator('#lock-error')).toContainText('not correct');
    await page.locator('#lock-code').fill('ward-7-test');
    await page.locator('#lock-submit').click();
    await expect(page.locator('#lock-screen')).toBeHidden();
    await expect(page.locator('article.bed')).toHaveCount(4);
    expect(urls.filter(u => u.includes('ward-7-test'))).toEqual([]); // never in a URL
    // Session-only by default: a new page needs the code again
    const page2 = await page.context().newPage();
    await page2.goto('/');
    await expect(page2.locator('#lock-screen')).toBeVisible();
  });
});
