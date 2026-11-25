// Gate on the Worker config `astro build` generates for `wrangler deploy` (dist/server/wrangler.json):
// Workers Static Assets wiring, the SMOL_API service binding, no public *.workers.dev / preview
// URLs, and no auto-provisioned SESSION KV or IMAGES bindings. Also run by scripts/check-bundle.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function checkWorkerConfig(distDir = join(ROOT, 'dist')) {
  const file = join(distDir, 'server', 'wrangler.json');
  const failures = [];
  const expect = (ok, message) => ok || failures.push(message);
  if (!existsSync(file)) return { failures: [`Missing ${file} (run \`pnpm build\`)`], summary: [] };

  const config = JSON.parse(readFileSync(file, 'utf8'));
  const services = config.services ?? [];
  expect(config.name === 'smol-fe', `name is ${JSON.stringify(config.name)} (expected "smol-fe")`);
  expect(config.assets?.directory === '../client', `assets.directory is ${JSON.stringify(config.assets?.directory)} (expected "../client")`);
  expect(config.assets?.binding === 'ASSETS', 'assets.binding must be "ASSETS"');
  expect(
    services.length === 1 && services[0].binding === 'SMOL_API' && services[0].service === 'smol-workflow',
    `services must be exactly SMOL_API -> smol-workflow (got ${JSON.stringify(services)})`,
  );
  expect(config.workers_dev === false, 'workers_dev must be false');
  expect(config.preview_urls === false, 'preview_urls must be false');
  expect((config.kv_namespaces ?? []).length === 0, `kv_namespaces must be empty (got ${JSON.stringify(config.kv_namespaces)})`);
  expect(!config.images, `images binding must be absent (got ${JSON.stringify(config.images)})`);
  expect(!config.compatibility_flags?.includes('disable_nodejs_process_v2'), 'drop the Astro 5.14 disable_nodejs_process_v2 flag');
  expect(existsSync(join(distDir, 'client', '_headers')), 'dist/client/_headers is missing');

  const summary = [
    `Worker config: ${config.name} | assets ${config.assets?.directory} | ` +
      `${services.map((s) => `${s.binding}->${s.service}`).join(', ')} | kv ${config.kv_namespaces?.length ?? 0} | ` +
      `images ${config.images ? 1 : 0} | workers_dev ${config.workers_dev} | preview_urls ${config.preview_urls}`,
  ];
  return { failures, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { failures, summary } = checkWorkerConfig();
  for (const line of summary) console.log(line);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.log(failures.length ? 'FAIL: Worker config gate' : 'PASS: Worker config gate');
  process.exit(failures.length ? 1 : 0);
}
