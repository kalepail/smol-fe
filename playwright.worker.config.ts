import { defineConfig } from '@playwright/test';

// `pnpm test:e2e:worker` (after `pnpm build`): the BUILT Worker (dist/server/wrangler.json) in
// workerd under `wrangler dev`, with Workers Static Assets and the SMOL_API service binding wired to
// a local `smol-workflow` stub (tests/fixtures/smol-workflow-stub) that forwards to the fixture API.
const worker = 'http://127.0.0.1:4331';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /worker-runtime\.spec\.ts$/,
  use: { baseURL: worker, channel: 'chrome' },
  webServer: [
    {
      command: 'node tests/fixtures/api.mjs',
      url: 'http://127.0.0.1:4339/__ready',
      env: { FIXTURE_API_PORT: '4339' },
    },
    {
      // `--local-upstream`: without it wrangler dev rewrites the request host to the `smol.xyz`
      // custom-domain route, so the Worker would render the production (indexable) host.
      command:
        'pnpm exec wrangler dev -c dist/server/wrangler.json -c tests/fixtures/smol-workflow-stub/wrangler.jsonc ' +
        '--ip 127.0.0.1 --port 4331 --local-upstream 127.0.0.1:4331 --show-interactive-dev-session=false',
      url: `${worker}/robots.txt`,
      env: { WRANGLER_SEND_METRICS: 'false' },
      timeout: 120_000,
    },
  ],
});
