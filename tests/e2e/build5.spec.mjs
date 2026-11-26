/**
 * v0.6.0 acceptance: example designs, aerodynamics, structures, the Formula Library
 * (built-in calculators; add, change and delete your own formulas), dashboard health.
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
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('.view').getByRole('button', { name: 'Start from an example' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start from an example' });
  await dialog.locator('.choice', { hasText: name }).click();
  await dialog.getByRole('button', { name: 'Create this design' }).click();
  await expect(page.locator('.view h1')).toContainText('Design Summary');
}

test('an example fixed wing opens complete: summary, aerodynamics, structures', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'Mapping fixed wing');
  await expect(page.locator('.view')).toContainText('Mapping fixed wing');
  await expect(page.locator('.view')).toContainText('Zero-lift drag coefficient');
  await go(page, '#/aerodynamics');
  await expect(page.locator('.view h1')).toContainText('Aerodynamics');
  const ld = page.locator('.stat', { hasText: 'Best L/D' }).locator('.stat__value');
  await expect(ld).toBeVisible();
  await expect(page.locator('.balance svg')).toBeVisible();
  await expect(page.locator('.drag-table tbody tr')).toHaveCount(5);
  // A cleaner airframe raises best L/D.
  const before = Number(await ld.innerText());
  await page.locator('[data-field="miscDrag"] input').fill('0');
  await page.keyboard.press('Tab');
  await expect.poll(async () => Number(await ld.innerText())).toBeGreaterThan(before);
  // CG behind the neutral point is an error.
  await page.locator('[data-field="cg"] input').fill('2000');
  await page.keyboard.press('Tab');
  await expect(page.locator('.view .check--error', { hasText: 'Unstable in pitch' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.view .check--error', { hasText: 'Unstable in pitch' })).toHaveCount(0);
  await page.locator('.view').getByRole('button', { name: 'Structures' }).first().click();
  await expect(page.locator('.view h1')).toContainText('Structural Analysis');
  await expect(page.locator('.card', { hasText: 'Wing spar' }).locator('.stat', { hasText: 'Margin of safety' })).toBeVisible();
  await expect(page.locator('.flow__step--current')).toContainText('Structures');
  expect(errors).toEqual([]);
});

test('a multirotor gets arm sizing with a vibration check; aerodynamics says it is not needed', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'Survey quadcopter');
  await go(page, '#/aerodynamics');
  await expect(page.locator('.view')).toContainText('This layout has no wing');
  await go(page, '#/structures');
  await expect(page.locator('.freq__track')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Arms' }).locator('.stat', { hasText: 'First bending frequency' })).toBeVisible();
  // Switch to a manual, thin tube: it fails.
  await page.getByLabel('Choose the arm tube automatically').uncheck();
  await page.locator('[data-field="armOuter"] input').fill('4');
  await page.keyboard.press('Tab');
  await page.locator('[data-field="armWall"] input').fill('0.5');
  await page.keyboard.press('Tab');
  await expect(page.locator('.view .check--error', { hasText: 'overstressed' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Formula Library: try a built-in formula; add, change and delete your own', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'Mapping fixed wing');
  await go(page, '#/formulas');
  await expect(page.locator('.view h1')).toContainText('Formula Library');
  await page.getByLabel('Search', { exact: true }).fill('stall speed');
  const card = page.locator('.formula[data-formula="stall-speed"]');
  await expect(card).toBeVisible();
  await card.locator('summary').click();
  await expect(card.locator('.formula__result')).toContainText('V_s =');
  await card.getByLabel('Mass (kg)').fill('12');
  await expect(card.locator('.formula__result')).toContainText(/V_s = 18\.2/); // 4× the mass → 2× the stall speed

  await page.getByRole('tab', { name: /Your formulas/ }).click();
  await page.getByRole('button', { name: 'Add a formula' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add your own formula' });
  await dialog.getByLabel('Name', { exact: true }).fill('Wing loading');
  await dialog.getByLabel('Symbol (variable name)').fill('WS');
  await dialog.getByLabel('Expression').fill('maxTakeoffMass * g0 / geo_fw_area');
  await expect(dialog.locator('.formula__result')).toContainText('the expression gives');
  await dialog.getByRole('button', { name: 'Use Pa' }).click();
  await expect(dialog.locator('.formula__result')).toContainText('WS =');
  await dialog.getByLabel('Rule').selectOption('<=');
  await dialog.getByLabel('Limit (in the result unit)').fill('10');
  await dialog.getByRole('button', { name: 'Add formula' }).click();
  const row = page.locator('tr[data-formula="WS"]');
  await expect(row).toContainText('Pa');
  await expect(row.locator('.badge--warning')).toBeVisible();

  await row.getByRole('button', { name: 'Change' }).click();
  const edit = page.getByRole('dialog', { name: /Change/ });
  await edit.getByLabel('Limit (in the result unit)').fill('500');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(row.locator('.badge--success')).toBeVisible();

  await go(page, '#/summary');
  await expect(page.locator('.card', { hasText: 'Your formulas (1)' })).toContainText('Wing loading');

  await go(page, '#/formulas?tab=yours');
  await page.locator('tr[data-formula="WS"]').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('tr[data-formula="WS"]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('tr[data-formula="WS"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('dashboard shows design health and the nine-step flow', async ({ page }) => {
  const errors = collectErrors(page);
  await fromExample(page, 'VTOL quadplane');
  await go(page, '#/dashboard');
  await expect(page.locator('.health .ring')).toBeVisible();
  await expect(page.locator('.health__tile', { hasText: 'Problems' })).toContainText('0');
  await expect(page.locator('.flow-list__item')).toHaveCount(9);
  expect(errors).toEqual([]);
});
