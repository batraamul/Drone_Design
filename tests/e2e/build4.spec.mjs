/**
 * v0.5.0 acceptance: design flow, propulsion and energy update with the design,
 * balloon glide-sonde mission, summary/build sheet, resources.
 */
import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function newProject(page, name, category = 'Multirotor') {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('.view').getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.locator('.choice', { hasText: category }).click();
  await dialog.getByRole('button', { name: /Create/ }).click();
  await expect(page.getByText(name).first()).toBeVisible();
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);

test('design flow leads from page to page', async ({ page }) => {
  const errors = collectErrors(page);
  await newProject(page, 'Flow test');
  await go(page, '#/architecture');
  await expect(page.locator('.flow__goal')).toContainText('Step 2 of 7');
  await page.locator('.flow').getByRole('button', { name: 'Next: Avionics & electronics' }).click();
  await expect(page.locator('.view h1')).toContainText('Avionics Laboratory');
  await page.getByRole('button', { name: 'Add example quadcopter set' }).click();
  await page.locator('.flow').getByRole('button', { name: 'Next: Propulsion & energy' }).click();
  await expect(page.locator('.view h1')).toContainText('Propulsion & Energy');
  await expect(page.locator('.flow__step--current')).toContainText('Propulsion');
  await go(page, '#/dashboard');
  await expect(page.locator('.flow-list__item')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('propulsion results follow motor and diameter changes', async ({ page }) => {
  await newProject(page, 'Propulsion test');
  await go(page, '#/avionics');
  await page.getByRole('button', { name: 'Add example quadcopter set' }).click();
  await go(page, '#/propulsion');
  const power = page.locator('.stat', { hasText: 'Hover power' }).locator('.stat__value');
  await expect(power).toBeVisible();
  const before = await power.innerText();
  await page.locator('[data-field="motor.kv"] input').fill('700');
  await page.keyboard.press('Tab');
  await expect.poll(() => power.innerText()).not.toBe(before);
  // Weak motor: cannot hover.
  await page.locator('[data-field="motor.kv"] input').fill('150');
  await page.keyboard.press('Tab');
  await expect(page.locator('.view .check--error', { hasText: 'Cannot hover' }).first()).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.view .check--error', { hasText: 'Cannot hover' })).toHaveCount(0);
  // Diameter lives in Drone Architecture; a change there updates the result here.
  const endurance = await page.locator('.stat', { hasText: 'Hover endurance' }).locator('.stat__value').innerText();
  await go(page, '#/architecture');
  await page.locator('[data-param="propDiameter"] input').fill('8');
  await page.keyboard.press('Tab');
  await go(page, '#/propulsion');
  await expect.poll(() => page.locator('.stat', { hasText: 'Hover endurance' }).locator('.stat__value').innerText()).not.toBe(endurance);
  await expect(page.locator('.view .check', { hasText: 'Propeller data is for a different size' }).first()).toBeVisible();
});

test('balloon glide-sonde mission: four stages, burst check responds to balloon size', async ({ page }) => {
  const errors = collectErrors(page);
  await newProject(page, 'Sonde test', 'Fixed wing');
  await go(page, '#/avionics');
  await page.getByRole('button', { name: 'Add example quadcopter set' }).click();
  await go(page, '#/sounding');
  await page.getByLabel('Plan a balloon-launched glide-sonde mission for this design').check();
  await expect(page.locator('.stages-table tbody tr')).toHaveCount(4);
  await page.getByLabel('Balloon', { exact: true }).selectOption({ label: 'Example 600 g latex balloon' });
  await expect(page.locator('.view .check--error', { hasText: 'Balloon bursts before the release altitude' }).first()).toBeVisible();
  await expect(page.locator('.stages-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Balloon', { exact: true }).selectOption({ label: 'Example 3000 g latex balloon' });
  await expect(page.locator('.stages-table tbody tr')).toHaveCount(4);
  await go(page, '#/summary');
  await expect(page.locator('.card', { hasText: 'Balloon glide-sonde mission' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('summary: parts list CSV and printable build sheet', async ({ page }) => {
  await newProject(page, 'Summary test');
  await go(page, '#/avionics');
  await page.getByRole('button', { name: 'Add example quadcopter set' }).click();
  await go(page, '#/summary');
  await expect(page.locator('.view h1')).toContainText('Design Summary');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Parts list (CSV)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Summary_test_parts.csv');
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  expect(text.split('\r\n')[0]).toBe('Item,Type,Quantity,Unit mass (g),Total mass (g),Data provenance,Source');
  expect(text).toContain('Motor');
});

test('resources list courses, tools and patent search with external links', async ({ page }) => {
  await page.goto('./#/learning/resources');
  await expect(page.locator('.view h1')).toHaveText('Courses, books & tools');
  for (const group of ['courses', 'books', 'data', 'tools', 'balloon', 'defence']) await expect(page.locator(`[data-group="${group}"]`)).toBeVisible();
  const nptel = page.getByRole('link', { name: /NPTEL, IIT Kanpur/ }).first();
  await expect(nptel).toHaveAttribute('target', '_blank');
  await expect(nptel).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('link', { name: /Defence Science Journal/ }).first()).toHaveAttribute('href', /publications\.drdo\.gov\.in/);
  await expect(page.getByRole('link', { name: /InPASS/ })).toHaveAttribute('href', 'https://iprsearch.ipindia.gov.in/publicsearch');
});
