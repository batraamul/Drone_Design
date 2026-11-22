/**
 * Playwright configuration for AEROLAB X end-to-end tests.
 * Tests run against the BUILT site (_site, produced by `npm run build`) served under
 * /Drone_Design/, exactly as GitHub Pages serves it.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/Drone_Design/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Software WebGL so the 3D Design Studio renders on CI machines without a GPU.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.mjs/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.mjs/ },
  ],
  webServer: {
    command: `node scripts/serve.mjs --root _site --port ${PORT} --base /Drone_Design/`,
    url: `http://localhost:${PORT}/Drone_Design/`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
