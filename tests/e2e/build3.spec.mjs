/**
 * Build 3 acceptance: components can be added, connected, saved and checked.
 */
import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function newProject(page, name) {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('.view').getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: /Create/ }).click();
  await expect(page.getByText(name).first()).toBeVisible();
}

const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);

test('example set: diagram, budget and checks; persists after reload', async ({ page }) => {
  const errors = collectErrors(page);
  await newProject(page, 'Avionics persist');
  await go(page, '#/avionics');
  await page.getByRole('button', { name: 'Add example quadcopter set' }).click();
  await expect(page.locator('svg.bd .bd__box')).toHaveCount(7);
  await expect(page.locator('svg.bd .bd__link')).toHaveCount(11);
  await expect(page.locator('.budget-table tbody tr')).toHaveCount(3);
  await expect(page.locator('.view .check--error')).toHaveCount(0);
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await go(page, '#/avionics');
  await expect(page.locator('svg.bd .bd__box')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('adding parts and connections runs the checks; undo removes the problem', async ({ page }) => {
  await newProject(page, 'Avionics checks');
  await go(page, '#/components');
  await page.locator('[data-add="ill-bat-6s-10000"]').click();
  await page.locator('[data-add="ill-fc-h7"]').click();
  await go(page, '#/avionics');
  await expect(page.locator('svg.bd .bd__box')).toHaveCount(2);
  // Battery straight into a 5 V flight controller: over-voltage.
  await page.getByLabel('Connection', { exact: true }).selectOption('power');
  await page.getByLabel('From', { exact: true }).selectOption({ label: 'Example 6S 10 000 mAh Li-ion' });
  await page.getByLabel('To', { exact: true }).selectOption({ label: 'Example H7-class flight controller' });
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('.view .check--error', { hasText: 'Over-voltage' }).first()).toBeVisible();
  await expect(page.locator('svg.bd .bd__box--error')).toHaveCount(2); // both ends of the faulty link
  await page.keyboard.press('Control+z');
  await expect(page.locator('.view .check--error', { hasText: 'Over-voltage' })).toHaveCount(0);
});

test('editing a specification updates the budget', async ({ page }) => {
  await newProject(page, 'Avionics edit');
  await go(page, '#/avionics');
  await page.getByRole('button', { name: 'Add example quadcopter set' }).click();
  const before = await page.locator('.budget-table').innerText();
  const esc = page.locator('details.component', { hasText: 'Example 40 A ESC' });
  await esc.locator('summary').click();
  await esc.getByLabel('Expected operating current (estimate) (optional)').fill('10');
  await expect.poll(() => page.locator('.budget-table').innerText()).not.toBe(before);
  await expect(page.locator('.view .check', { hasText: 'Propulsion current not included' })).toHaveCount(0);
});

test('custom component with datasheet provenance asks for a source', async ({ page }) => {
  await newProject(page, 'Avionics custom');
  await go(page, '#/avionics');
  await page.getByRole('button', { name: 'Add your own component' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add your own component' });
  await dialog.getByLabel('Name').fill('My pitot sensor');
  await dialog.getByRole('button', { name: 'Add component' }).click();
  await expect(page.locator('.view .check', { hasText: 'Datasheet or measured values without a source' })).toBeVisible();
  const item = page.locator('details.component', { hasText: 'My pitot sensor' });
  await item.locator('summary').click();
  await item.getByLabel('Source').fill('Sensor datasheet rev. C, p. 4');
  await item.getByLabel('Source').press('Tab');
  await expect(page.locator('.view .check', { hasText: 'Datasheet or measured values without a source' })).toHaveCount(0);
});
