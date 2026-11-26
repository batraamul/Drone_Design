/**
 * v0.7.0 acceptance: Mass & Balance (drag and type positions, balance button), Flight
 * Dynamics (wing modes, hover simulation), forward-speed propeller data, OpenVSP export.
 */
import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);

async function fromExample(page, name) {
  await page.goto('./#/projects');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('.view h1')).toContainText('Projects');
  await page.locator('.view').getByRole('button', { name: 'Start from an example' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start from an example' });
  await dialog.locator('.choice', { hasText: name }).click();
  await dialog.getByRole('button', { name: 'Create this design' }).click();
  await expect(page.locator('.view h1')).toContainText('Design Summary');
}

test('Mass & Balance: typed move shifts the CG, balance button restores it, undo works', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'Survey quadcopter');
  await go(page, '#/balance');
  await expect(page.locator('.view h1')).toContainText('Mass & Balance');
  await expect(page.locator('.bal__view')).toHaveCount(2);
  const cg = page.locator('.stat', { hasText: 'CG forward of centre' }).locator('.stat__value');
  const row = page.locator('.bal__table tr', { hasText: 'Example 4S' }).first();
  await row.getByLabel(/Forward \(mm\)/).fill('120');
  await row.getByLabel(/Forward \(mm\)/).press('Enter');
  await expect(page.locator('.view .check', { hasText: 'CG is off the centre of thrust' })).toBeVisible();
  const off = await cg.innerText();
  await page.getByRole('button', { name: 'Balance with the battery' }).click();
  await expect(page.locator('.view .check', { hasText: 'CG is off the centre of thrust' })).toHaveCount(0);
  await expect(cg).not.toHaveText(off);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.view .check', { hasText: 'CG is off the centre of thrust' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Mass & Balance: dragging a part on the side view moves it', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'Mapping fixed wing');
  await go(page, '#/balance');
  const sm = page.locator('.stat', { hasText: 'Static margin' }).locator('.stat__value');
  await expect(sm).toHaveText(/10(\.0)?\s?%/);
  const dot = page.locator('svg[data-view="side"] .bal__dot--movable').first();
  const box = await dot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(sm).not.toHaveText(/^10(\.0)?\s?%$/);
  expect(errors).toEqual([]);
});

test('Flight Dynamics: fixed-wing modes and responses; hover simulation for a quadcopter', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'Balloon-launched glide-sonde');
  await go(page, '#/flight-dynamics');
  await expect(page.locator('.view h1')).toContainText('Flight Dynamics');
  await expect(page.locator('.mode')).toHaveCount(5);
  await expect(page.locator('.mode[data-mode="Short period"]')).toHaveClass(/mode--good/);
  await expect(page.locator('.root-plot')).toBeVisible();
  await expect(page.locator('.chart')).toHaveCount(4);
  await fromExample(page, 'Survey quadcopter');
  await go(page, '#/flight-dynamics');
  await expect(page.locator('.stat', { hasText: '1 m climb: settles in' })).toBeVisible();
  await expect(page.locator('.view')).toContainText('Controller');
  // A sluggish motor and an over-ambitious controller are flagged.
  await page.locator('[data-field="motorTimeConstant"] input').fill('200');
  await page.keyboard.press('Tab');
  await page.locator('[data-field="attitudeBandwidth"] input').fill('20');
  await page.keyboard.press('Tab');
  await expect(page.locator('.view .check', { hasText: /bandwidth is too high|lost control|limits/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Propulsion: pasted forward-speed data is used; quadplane has a cruise set; OpenVSP script downloads', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'VTOL quadplane');
  await go(page, '#/propulsion');
  const cruiseCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Cruise propeller', exact: true }) });
  await expect(cruiseCard).toBeVisible();
  const details = cruiseCard.locator('details.prop-table');
  await details.locator('summary').click();
  await details.locator('textarea').fill('0.0 0.11 0.050\n0.2 0.10 0.050\n0.4 0.085 0.047\n0.6 0.065 0.040\n0.8 0.035 0.025');
  await details.getByRole('button', { name: 'Use this data' }).click();
  await expect(cruiseCard.locator('details.prop-table summary')).toContainText('your table (5 rows)');
  await expect(page.locator('.view')).toContainText('Cruise propeller efficiency');
  await go(page, '#/design-studio');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export OpenVSP script' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.vspscript$/);
  expect(errors).toEqual([]);
});
