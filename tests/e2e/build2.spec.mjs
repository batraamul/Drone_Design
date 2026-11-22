/**
 * Build 2 acceptance: configurations persist, and the 2D drawings, the geometry review
 * and the 3D model respond to parameter changes.
 */
import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function newProject(page, name, category) {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('.view').getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.locator('.choice', { hasText: category }).click();
  await dialog.getByRole('button', { name: /Create/ }).click();
  await expect(page.locator('#project-name, .topbar').getByText(name).first()).toBeVisible();
}

const param = (page, key) => page.locator(`[data-param="${key}"] input`);

test('layout and dimensions persist across a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await newProject(page, 'Persist test', 'Multirotor');
  await page.goto('./#/architecture');
  await page.locator('[data-layout="hexa-x"]').click();
  await expect(param(page, 'armLength')).toHaveValue('350');
  await param(page, 'armLength').fill('400');
  await page.keyboard.press('Tab');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.goto('./#/architecture');
  await expect(page.locator('[data-layout="hexa-x"] input')).toBeChecked();
  await expect(param(page, 'armLength')).toHaveValue('400');
  expect(errors).toEqual([]);
});

test('drawings and the geometry review respond to parameter changes, and undo restores them', async ({ page }) => {
  await newProject(page, 'Drawing test', 'Multirotor');
  await page.goto('./#/architecture');
  const top = page.locator('svg.view2d[data-view="top"]');
  await expect(top).toBeVisible();
  await expect(top.locator('.view2d__rotor')).toHaveCount(4);
  const before = await top.innerHTML();
  await expect(page.getByText('No geometry problems found.')).toBeVisible();

  // Large propellers on short arms overlap: the drawing changes and the review reports it.
  await param(page, 'propDiameter').fill('14');
  await expect.poll(() => top.innerHTML()).not.toBe(before);
  await expect(page.locator('.check--error', { hasText: 'Propellers overlap' }).first()).toBeVisible();

  await page.locator('[data-layout="x8"]').click();
  await expect(top.locator('.view2d__rotor')).toHaveCount(8);

  await page.keyboard.press('Control+z');
  await expect(top.locator('.view2d__rotor')).toHaveCount(4);
});

test('fixed-wing layouts draw wing and tail and compute tail volume coefficients', async ({ page }) => {
  await newProject(page, 'Wing test', 'Fixed wing');
  await page.goto('./#/architecture');
  await expect(page.locator('svg.view2d[data-view="top"] .view2d__surface')).toHaveCount(4);
  await expect(page.locator('.view .derived', { hasText: 'Horizontal tail volume coefficient' })).toBeVisible();
  await param(page, 'tailArm').fill('0.1');
  await expect(page.locator('.check--error', { hasText: 'Tail overlaps the wing' }).first()).toBeVisible();
  await page.locator('[data-layout="flying-wing"]').click();
  await expect(page.locator('svg.view2d[data-view="top"] .view2d__surface')).toHaveCount(2);
});

test('3D Design Studio builds the model from the geometry and rebuilds it on change', async ({ page }) => {
  const errors = collectErrors(page);
  await newProject(page, '3D test', 'VTOL');
  await page.goto('./#/design-studio');
  const stage = page.locator('[data-testid="view3d"]');
  await expect(stage).toBeVisible();
  const canvas = stage.locator('canvas');
  const fallback = stage.locator('svg.view2d');
  await expect(canvas.or(fallback).first()).toBeVisible({ timeout: 15_000 });
  if (await canvas.count()) {
    await expect(stage).toHaveAttribute('data-model-revision', '1');
    await param(page, 'span').fill('3');
    await expect(stage).toHaveAttribute('data-model-revision', '2');
    await page.getByRole('button', { name: 'Top', exact: true }).click();
  } else {
    await expect(fallback).toHaveCount(3);
  }
  expect(errors.filter((e) => !/WebGL|GPU|swiftshader/i.test(e))).toEqual([]);
});

test('changing the project category switches to a layout of that category', async ({ page }) => {
  await newProject(page, 'Category test', 'Multirotor');
  await page.goto('./#/architecture');
  await page.getByLabel('Aircraft category').selectOption('fixed-wing');
  await expect(page.locator('[data-layout="conventional"] input')).toBeChecked();
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-layout="quad-x"] input')).toBeChecked();
});
