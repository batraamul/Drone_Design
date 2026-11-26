import { test, expect } from '@playwright/test';

test('small screens use drawers and never scroll horizontally', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  const sidenav = page.locator('#sidenav');
  await expect(sidenav).not.toBeInViewport();

  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(sidenav).toBeInViewport();
  await sidenav.getByRole('link', { name: /Learning Centre/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Learning Centre' })).toBeVisible();
  await expect(sidenav).not.toBeInViewport();

  await page.getByRole('button', { name: 'Toggle inspector' }).click();
  await expect(page.locator('#inspector')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('#inspector')).not.toBeInViewport();

  for (const hash of ['#/dashboard', '#/projects', '#/settings', '#/learning/standard-atmosphere', '#/propulsion', '#/formulas']) {
    await page.goto(`./${hash}`);
    await expect(page.locator(`.view[data-view="${hash.split("/")[1].split("?")[0]}"] h1`)).toBeVisible();
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - Math.min(window.innerWidth, screen.width));
    expect(overflow, `horizontal overflow on ${hash}`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test('Build 2 pages fit small screens with a project open', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('.view').getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Phone');
  await dialog.getByRole('button', { name: /Create/ }).click();
  for (const hash of ['#/architecture', '#/design-studio', '#/learning/rotor-layout-hover', '#/learning/wing-planform-tail', '#/avionics', '#/components', '#/learning/avionics-power-interfaces', '#/propulsion', '#/sounding', '#/summary', '#/learning/resources', '#/learning/balloon-glidesonde', '#/aerodynamics', '#/structures', '#/formulas', '#/formulas?tab=yours', '#/learning/aerodynamics-stability', '#/learning/structures-sizing', '#/balance', '#/flight-dynamics', '#/learning/mass-balance-dynamics']) {
    await page.goto(`./${hash}`);
    await expect(page.locator(`.view[data-view="${hash.split("/")[1].split("?")[0]}"] h1`)).toBeVisible();
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - Math.min(window.innerWidth, screen.width));
    expect(overflow, `horizontal overflow on ${hash}`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});
