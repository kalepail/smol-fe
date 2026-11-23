import { defineConfig } from '@playwright/test';

const frontend = 'http://127.0.0.1:4328';
const api = 'http://127.0.0.1:4329';

export default defineConfig({
  testDir: './tests/e2e',
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
      command: 'pnpm dev --host 127.0.0.1 --port 4328',
      url: frontend,
      env: {
        PUBLIC_API_URL: api,
        PUBLIC_RPC_URL: 'https://127.0.0.1:4329',
        SMOL_E2E: '1',
        PUBLIC_E2E_SEAMS: '1',
      },
    },
  ],
});
