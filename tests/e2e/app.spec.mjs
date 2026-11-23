/**
 * End-to-end tests for Build 1 acceptance criteria, run against the built site
 * served under /Drone_Design/ (as on GitHub Pages).
 */
import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openApp(page, hash = '') {
  await page.goto(`./${hash}`);
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
}

async function createProject(page, name, category = 'Fixed wing') {
  await page.locator('.view').getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.locator('.choice', { hasText: category }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

const saved = (page) => expect(page.locator('#save-state')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

test('launches without console errors and lists all 20 modules', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await expect(page).toHaveTitle('Dashboard — AEROLAB X');
  await expect(page.locator('#sidenav .nav-item')).toHaveCount(22);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('#brand-build')).toHaveText(/^Build \d+ · v\d+\.\d+\.\d+$/);
  expect(errors).toEqual([]);
});

test('navigation reaches every module and planned modules state they are not implemented', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  const links = page.locator('#sidenav .nav-item');
  const count = await links.count();
  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    const title = await link.getAttribute('title');
    const planned = (await link.getAttribute('class')).includes('nav-item--planned');
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.view h1')).toContainText(title);
    if (planned) {
      await expect(page.getByText('Not implemented yet.')).toBeVisible();
    } else {
      await expect(page.getByText('Not implemented yet.')).toHaveCount(0);
    }
  }
  await page.goto('./#/no-such-module');
  await expect(page.getByText('Page not found')).toBeVisible();
  expect(errors).toEqual([]);
});

test('creates a project, checks requirements live, autosaves and reloads it', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await createProject(page, 'Survey Wing Mk1');
  await expect(page.getByRole('tab', { name: /Requirements/ })).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('Range (total flight distance)', { exact: true }).fill('20');
  await page.getByLabel('Cruise airspeed', { exact: true }).fill('15');
  await page.getByLabel('Endurance', { exact: true }).fill('15');
  await expect(page.locator('.view .check--warning').first()).toContainText('Endurance target is shorter than the time needed to fly the range');
  await expect(page.locator('.view .derived', { hasText: 'Minimum flight time' })).toContainText('22.22 min');

  await page.getByLabel('Operating altitude (AMSL)', { exact: true }).fill('1500');
  await expect(page.locator('.view .derived', { hasText: 'Air density at operating altitude' })).toContainText('1.058 kg/m³');
  await saved(page);

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('#project-name')).toHaveText('Survey Wing Mk1');
  await expect(page.getByLabel('Range (total flight distance)', { exact: true })).toHaveValue('20');
  await expect(page.getByLabel('Endurance', { exact: true })).toHaveValue('15');
  await expect(page.locator('#inspector .check--warning').first()).toBeVisible();

  await page.getByLabel('Endurance unit').selectOption('s');
  await expect(page.getByLabel('Endurance', { exact: true })).toHaveValue('900');
  expect(errors).toEqual([]);
});

test('invalid input is rejected without changing the stored value', async ({ page }) => {
  await openApp(page);
  await createProject(page, 'Validation');
  const mass = page.getByLabel('Maximum take-off mass (MTOW)', { exact: true });
  await mass.fill('-3');
  await expect(page.locator('.requirement', { has: mass }).locator('.field__error')).toContainText('greater than zero');
  await mass.fill('1,5');
  await expect(page.locator('.requirement', { has: mass }).locator('.field__error')).toContainText('decimal separator');
  await mass.fill('2.5');
  await expect(page.locator('.requirement', { has: mass }).locator('.field__error')).toHaveText('');
  await saved(page);
});

test('undo and redo work from the toolbar and keyboard', async ({ page }) => {
  await openApp(page);
  await createProject(page, 'Undo Test');
  await page.getByRole('tab', { name: /Overview/ }).click();
  const name = page.getByLabel('Project name');
  await name.fill('Renamed design');
  await expect(page.locator('#project-name')).toHaveText('Renamed design');
  await name.blur();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#project-name')).toHaveText('Undo Test');
  await expect(name).toHaveValue('Undo Test');
  await page.keyboard.press('Control+Shift+Z');
  await expect(name).toHaveValue('Renamed design');
});

test('notes are saved with the project', async ({ page }) => {
  await openApp(page);
  await createProject(page, 'Notes Test');
  await page.getByRole('tab', { name: /Notes/ }).click();
  await page.locator('.card').getByRole('button', { name: 'New note' }).first().click();
  await page.getByLabel('Title').fill('Battery decision');
  await page.getByLabel('Note', { exact: true }).fill('Chose 6S for lower current at the same power.');
  await saved(page);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Chose 6S for lower current at the same power.');
});

test('saves a version, compares it and restores it with a safety snapshot', async ({ page }) => {
  await openApp(page);
  await createProject(page, 'Versioned');
  await page.getByLabel('Endurance', { exact: true }).fill('20');
  await page.getByRole('tab', { name: /Versions/ }).click();
  await page.getByLabel('Version label').fill('Baseline');
  await page.locator('.version-form').getByRole('button', { name: 'Save version' }).click();
  const row = page.locator('tbody tr', { hasText: 'Baseline' });
  await expect(row).toBeVisible();

  await page.getByRole('tab', { name: /Requirements/ }).click();
  await page.getByLabel('Endurance', { exact: true }).fill('35');
  await saved(page);
  await page.getByRole('tab', { name: /Versions/ }).click();
  await row.getByRole('button', { name: 'Compare' }).click();
  await expect(page.locator('.comparison')).toContainText('Endurance');
  await expect(page.locator('.comparison')).toContainText('20 min');
  await expect(page.locator('.comparison')).toContainText('35 min');

  await row.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('table', { name: 'Saved versions' })).toContainText('Safety snapshot');
  await page.getByRole('tab', { name: /Requirements/ }).click();
  await expect(page.getByLabel('Endurance', { exact: true })).toHaveValue('20');
});

test('exports a project and imports it back as a copy', async ({ page }) => {
  await openApp(page);
  await createProject(page, 'Export Me');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.page-header__actions').getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^export-me-.+\.aerolab\.json$/);
  const file = await download.path();

  await page.goto('./#/projects');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.page-header__actions').getByRole('button', { name: 'Import' }).click();
  await (await chooserPromise).setFiles(file);
  await expect(page.getByRole('heading', { level: 1, name: 'Export Me (imported)' })).toBeVisible();
});

test('trash, restore and permanent deletion ask before acting', async ({ page }) => {
  await openApp(page);
  await createProject(page, 'Disposable');
  await page.locator('.page-header__actions').getByRole('button', { name: 'Move this project to the Trash' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My Projects' })).toBeVisible();
  await expect(page.locator('#project-name')).toHaveText('No project open');
  await page.getByRole('link', { name: /Trash \(1\)/ }).click();
  await expect(page.locator('tbody')).toContainText('Disposable');
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('The Trash is empty')).toBeVisible();
});

test('theme preference persists across reloads', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('command palette searches modules and glossary', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('aerodyn');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: /Aerodynamics/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox').fill('lapse rate');
  await page.keyboard.press('Enter');
  await expect(page.locator('.glossary')).toContainText('Lapse rate');
});

test('learning centre: ISA calculator and knowledge check', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, '#/learning/standard-atmosphere');
  await page.getByLabel('Altitude type').selectOption('geopotential');
  await page.getByLabel('Altitude', { exact: true }).fill('11000');
  await expect(page.locator('.result-table')).toContainText('216.65 K');
  await expect(page.locator('.result-table')).toContainText('22,632 Pa');
  await page.getByLabel('216.65 K', { exact: true }).check();
  await page.getByLabel('Lower', { exact: true }).check();
  await page.getByLabel('80 %', { exact: true }).check();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByText('3 of 3 correct. Lesson completed.')).toBeVisible();
  await page.goto('./#/learning');
  await expect(page.locator('.lesson-card', { hasText: 'International Standard Atmosphere' })).toContainText('Completed');
  expect(errors).toEqual([]);
});

test('a project saved in another tab is reloaded in this tab', async ({ page, context }) => {
  await openApp(page);
  await createProject(page, 'Shared Design');
  await saved(page);
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await other.getByRole('tab', { name: /Overview/ }).click();
  await other.getByLabel('Project name').fill('Shared Design (edited in tab 2)');
  await expect(other.locator('#save-state')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
  await expect(page.locator('#project-name')).toHaveText('Shared Design (edited in tab 2)', { timeout: 10_000 });
  await other.close();
});

test('works offline after the first visit (service worker)', async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('#sidenav').getByRole('link', { name: /Learning Centre/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Learning Centre' })).toBeVisible();
  await context.setOffline(false);
});

test('interactive controls have accessible names', async ({ page }) => {
  await openApp(page);
  await createProject(page, 'A11y');
  for (const hash of ['#/dashboard', '#/projects', `#/settings`, '#/learning/si-units']) {
    await page.goto(`./${hash}`);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('.view h1')).toBeVisible();
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], input, select, textarea')]
        .filter((el) => el.type !== 'hidden' && !el.closest('[hidden]') && el.getClientRects().length > 0)
        .filter((el) => {
          const labelledBy = el.getAttribute('aria-labelledby');
          const name =
            el.getAttribute('aria-label') ||
            (labelledBy && document.getElementById(labelledBy)?.textContent.trim()) ||
            el.textContent.trim() ||
            el.getAttribute('title') ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent.trim()) ||
            el.closest('label')?.textContent.trim() ||
            el.getAttribute('placeholder');
          return !name;
        })
        .map((el) => el.outerHTML.slice(0, 140)),
    );
    expect(unnamed, `unnamed controls on ${hash}`).toEqual([]);
  }
});

test('Google Drive sync card guides set-up and the getting-started guide tracks progress', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await expect(page.locator('#sync-status-text')).toHaveText('Drive: off');
  const guide = page.locator('section.card', { has: page.getByRole('heading', { name: 'Getting started', exact: true }) });
  await expect(guide).toContainText('0 of 5 steps done');
  await createProject(page, 'Guide Test');
  await page.goto('./#/dashboard');
  await expect(guide).toContainText('1 of 5 steps done');

  await page.locator('#sync-status').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const sync = page.locator('section.card', { has: page.getByRole('heading', { name: 'Google Drive sync', exact: true }) });
  const clientId = sync.getByLabel('1. Your Google OAuth Client ID');
  await clientId.fill('not-a-client-id');
  await clientId.blur();
  await expect(sync.locator('.field__error').first()).toContainText('does not look like a Client ID');
  await clientId.fill('');
  await clientId.blur();
  await sync.getByRole('button', { name: 'Connect Google Drive and sync' }).click();
  await expect(sync).toContainText('Needs set-up');
  await expect(sync).toContainText('Paste a valid OAuth Client ID first');
  await expect(page.locator('section.card', { has: page.getByRole('heading', { name: 'Install the app', exact: true }) })).toContainText('Ubuntu / Kali Linux');
  expect(errors).toEqual([]);
});
