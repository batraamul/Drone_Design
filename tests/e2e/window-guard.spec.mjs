/**
 * Window guard: AEROLAB X must hand a Safari (macOS) web-app window that belongs to
 * E-Diary back to E-Diary, and must leave its own window and normal tabs alone.
 */
import { test, expect } from '@playwright/test';

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

async function asSafariWebApp(browser) {
  const context = await browser.newContext({ userAgent: SAFARI_MAC });
  await context.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query.includes('display-mode: standalone')
        ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
        : real(query);
  });
  // Stand-in for E-Diary on the same host.
  await context.route('**/e-diary/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>E-Diary Planner</title><h1>E-Diary</h1>' })
  );
  return context;
}

test('inside the E-Diary Safari window, AEROLAB X returns the window to E-Diary', async ({ browser, baseURL }) => {
  const context = await asSafariWebApp(browser);
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.getByText('This window is your E-Diary. Returning to E-Diary…')).toBeVisible();
  await page.waitForURL('**/e-diary/', { timeout: 5000 });
  await expect(page).toHaveTitle('E-Diary Planner');
  await context.close();
});

test('AEROLAB X launched as its own Safari web app is left alone', async ({ browser, baseURL }) => {
  const context = await asSafariWebApp(browser);
  const page = await context.newPage();
  await page.goto(`${baseURL}?app=aerolab#/dashboard`);
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.waitForTimeout(2000);
  expect(page.url()).toContain('/Drone_Design/');
  await context.close();
});

test('a normal browser tab is not redirected and its address is tagged for Add to Dock', async ({ page }) => {
  await page.goto('./#/dashboard');
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  expect(page.url()).toContain('?app=aerolab#/dashboard');
});
