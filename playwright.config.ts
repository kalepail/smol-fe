import { defineConfig } from '@playwright/test';

const frontend = 'http://127.0.0.1:4328';
const api = 'http://127.0.0.1:4329';

export default defineConfig({
  testDir: './tests/e2e',
  // The built-Worker smoke test runs under playwright.worker.config.ts (`pnpm test:e2e:worker`).
  testIgnore: /worker-runtime\.spec\.ts$/,
  use: {
    baseURL: frontend,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    launchOptions: { args: ['--autoplay-policy=user-gesture-required'] },
  },
  // Tests tagged @isolated assert global fixture-API request counts, so they
  // run alone, after every other test (no concurrent traffic on the counter).
  projects: [
    { name: 'main', grepInvert: /@isolated/ },
    { name: 'isolated', grep: /@isolated/, dependencies: ['main'] },
  ],
  webServer: [
    {
      command: 'node tests/fixtures/api.mjs',
      url: `${api}/__ready`,
    },
    {
      // `--ignore-lock`: a foreground one-off server owned by Playwright. Astro 7 otherwise
      // backgrounds `astro dev` when it detects a coding agent (the webServer would exit at once).
      command: 'pnpm dev --host 127.0.0.1 --port 4328 --ignore-lock',
      url: frontend,
      env: {
        PUBLIC_API_URL: api,
        PUBLIC_RPC_URL: 'https://127.0.0.1:4329',
        SMOL_E2E: '1',
        PUBLIC_E2E_SEAMS: '1',
        // Production turns these on (wrangler.jsonc); specs opt in per test via __smolCollectSeams.
        PUBLIC_CHAIN_SNAPSHOT: '0',
        PUBLIC_MINT_STATUS: '0',
      },
    },
  ],
});
