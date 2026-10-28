// End-to-end tests run against the local dev server, which executes the real
// backend/Code.gs in a sandbox with fictional data (never production data).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    channel: 'chrome', // uses the installed Google Chrome; no browser download needed
    baseURL: 'http://localhost:5180',
    trace: 'off',
  },
  webServer: [
    {
      // E2E_DIST=1 tests the minified production build in dist/ instead of the sources.
      command: process.env.E2E_DIST ? 'node scripts/build.mjs && node dev/server.mjs --fresh --dist' : 'node scripts/build.mjs --css-only && node dev/server.mjs --fresh',
      url: 'http://localhost:5180',
      env: { PORT: '5180', LATENCY_MS: '120' },
      reuseExistingServer: false,
    },
    {
      command: process.env.E2E_DIST ? 'node dev/server.mjs --fresh --dist' : 'node dev/server.mjs --fresh',
      url: 'http://localhost:5181',
      env: { PORT: '5181', LATENCY_MS: '50', APP_ACCESS_CODE: 'ward-7-test' },
      reuseExistingServer: false,
    },
  ],
});
