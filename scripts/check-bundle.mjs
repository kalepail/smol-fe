import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { checkWorkerConfig } from './check-worker-config.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
// @astrojs/cloudflare 14 (Workers Static Assets): client assets live in dist/client/.
const ASTRO_DIR = join(ROOT, 'dist', 'client', '_astro');
const SRC_DIR = join(ROOT, 'src');

const jsFiles = readdirSync(ASTRO_DIR).filter((file) => file.endsWith('.js'));
const contents = new Map();
const rawSizes = new Map();
const gzSizes = new Map();

for (const file of jsFiles) {
  const full = join(ASTRO_DIR, file);
  const text = readFileSync(full, 'utf8');
  contents.set(file, text);
  rawSizes.set(file, statSync(full).size);
  gzSizes.set(file, gzipSync(text).length);
}

// Extract STATIC ES imports/re-exports from minified Vite chunks (ignores dynamic import("...")).
const STATIC_FROM_RE = /\b(?:import|export)\s*(?:[\w*{},\s$]+?)\s*from\s*["'](\.\/[^"']+\.js)["']/g;
const STATIC_BARE_RE = /(?:^|[;\n}])\s*import\s*["'](\.\/[^"']+\.js)["']/g;

const staticDeps = new Map();
for (const [file, text] of contents) {
  const deps = new Set();
  for (const match of text.matchAll(STATIC_FROM_RE)) {
    const target = match[1].replace(/^\.\//, '');
    if (contents.has(target)) deps.add(target);
  }
  for (const match of text.matchAll(STATIC_BARE_RE)) {
    const target = match[1].replace(/^\.\//, '');
    if (contents.has(target)) deps.add(target);
  }
  staticDeps.set(file, deps);
}

function getClosure(entryFiles) {
  const visited = new Set();
  const stack = [...entryFiles];
  while (stack.length) {
    const file = stack.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    for (const dep of staticDeps.get(file) ?? []) {
      if (!visited.has(dep)) stack.push(dep);
    }
  }
  return visited;
}

function findEntry(prefix) {
  return jsFiles.filter((file) => file.startsWith(`${prefix}.`));
}

// Rendered module ids per emitted client chunk (astro.config.mjs `smol:client-modules-report`).
// Loaded up front: it also names the Svelte hydration entry (section 3c gates its contents).
const CLIENT_MODULES_REPORT = join(ROOT, '.astro', 'client-bundle-modules.json');
let moduleReport = null;
let moduleReportError = null;
try {
  moduleReport = JSON.parse(readFileSync(CLIENT_MODULES_REPORT, 'utf8'));
} catch (error) {
  moduleReportError = error;
}

// Astro 5 named the Svelte island renderer chunk `client.svelte.*`; Astro 7 / Rolldown emits
// several generic `client.*` chunks, so find the renderer by the module rendered into it.
function svelteRendererEntries() {
  const RENDERER_RE = /(?:^|\/)node_modules\/@astrojs\/svelte(?:-renderer)?\/dist\/client\.svelte\.js$/;
  const found = Object.entries(moduleReport?.chunks ?? {})
    .filter(([file, ids]) => contents.has(file) && ids.some((id) => RENDERER_RE.test(id)))
    .map(([file]) => file);
  return found.length ? found : findEntry('client');
}

// Fingerprints of heavy/forbidden libraries inside chunk contents.
const FORBIDDEN_MARKERS = [
  { name: 'tldts', test: (s) => s.includes('tldts') || s.includes('publicsuffix') },
  {
    name: 'passkey-kit',
    test: (s) =>
      s.includes('PasskeyKit') ||
      (s.includes('connectWallet') && s.includes('createWallet') && s.includes('SACClient')),
  },
  {
    name: 'stellar-sdk',
    test: (s) =>
      s.includes('SorobanRpc') ||
      s.includes('TransactionBuilder') ||
      s.includes('xdr.LedgerKey') ||
      s.includes('Networks.PUBLIC'),
  },
  {
    // npm `buffer` polyfill: only the lazy wallet/chain modules may load it (src/utils/bufferGlobal.ts).
    name: 'buffer polyfill',
    test: (s) => s.includes('ERR_BUFFER_OUT_OF_BOUNDS'),
  },
];

const shellEntries = [
  ...findEntry('TopBar'),
  ...findEntry('PlayerDock'),
  ...findEntry('TabBar'),
  ...findEntry('MixtapeBuilderOverlay'),
  ...findEntry('ClientRouter'),
  ...svelteRendererEntries(),
];

// Two-tier gzip budgets (warn target / hard fail ceiling) per route class.
// Real regressions (accidental static imports of stellar-sdk/passkey-kit/tldts/buffer)
// are enforced independently by FORBIDDEN_MARKERS below.
const BROWSE_BUDGET = { warnKb: 75, failKb: 100 };
const APP_BUDGET = { warnKb: 120, failKb: 150 };

const routes = [
  { name: '/ (Home)', entries: [...shellEntries, ...findEntry('Home')], budget: BROWSE_BUDGET },
  { name: '/[id] & /create (Smol)', entries: [...shellEntries, ...findEntry('Smol')], budget: APP_BUDGET },
  { name: '/mixtapes/[id]', entries: [...shellEntries, ...findEntry('MixtapeDetailView')], budget: APP_BUDGET },
  { name: '/mixtapes', entries: [...shellEntries, ...findEntry('MixtapesIndex')], budget: APP_BUDGET },
  { name: '/search', entries: [...shellEntries, ...findEntry('SearchResults')], budget: BROWSE_BUDGET },
  { name: '/artists/[address]', entries: [...shellEntries, ...findEntry('ArtistPage')], budget: BROWSE_BUDGET },
  {
    name: '/playlist/[playlist]',
    entries: [...shellEntries, ...findEntry('Leaderboard'), ...findEntry('Home')],
    budget: BROWSE_BUDGET,
  },
  { name: '/account', entries: [...shellEntries, ...findEntry('Account')], budget: APP_BUDGET },
  // /created wraps the shared grid with its owner title filter; /liked renders the Home grid.
  { name: '/created', entries: [...shellEntries, ...findEntry('CreatedSongs')], budget: BROWSE_BUDGET },
  { name: '/liked', entries: [...shellEntries, ...findEntry('Home')], budget: BROWSE_BUDGET },
];

const warnings = [];
const failures = [];

// 1. Ensure tldts does not exist in ANY chunk
for (const [file, text] of contents) {
  if (
    text.includes('tldts') ||
    (text.includes('co.uk') && text.includes('gov.uk') && text.length > 50_000)
  ) {
    failures.push(`Found tldts / public suffix data in chunk: ${file}`);
  }
}

// 2. Check each route's static import closure
console.log('=== SMOL Transitive Static Import Closure Report (dist/client/_astro) ===');
for (const route of routes) {
  if (route.entries.length === 0) {
    failures.push(`No entry chunks found for route ${route.name}`);
    continue;
  }
  const closure = getClosure(route.entries);
  let totalRaw = 0;
  let totalGz = 0;
  for (const file of closure) {
    totalRaw += rawSizes.get(file) ?? 0;
    totalGz += gzSizes.get(file) ?? 0;
    const text = contents.get(file) ?? '';
    for (const marker of FORBIDDEN_MARKERS) {
      if (marker.test(text)) {
        failures.push(
          `Route ${route.name} statically pulls ${marker.name} via chunk ${file} (${(rawSizes.get(file) / 1024).toFixed(1)} KB raw)`
        );
      }
    }
  }
  console.log(
    `  ${route.name.padEnd(24)} ${closure.size.toString().padStart(2)} chunks | ${(totalRaw / 1024).toFixed(1).padStart(6)} KB raw | ${(totalGz / 1024).toFixed(1).padStart(5)} KB gz`
  );

  const gzKb = totalGz / 1024;
  if (gzKb > route.budget.failKb) {
    failures.push(
      `Route ${route.name} static JS closure is ${gzKb.toFixed(1)} KB gzip (fail ceiling <= ${route.budget.failKb}.0 KB gzip).`
    );
  } else if (gzKb > route.budget.warnKb) {
    warnings.push(
      `Route ${route.name} static JS closure is ${gzKb.toFixed(1)} KB gzip (warn target <= ${route.budget.warnKb}.0 KB gzip).`
    );
  }
}

// 3. Single-XDR-chunk gate (FE-1). The Stellar XDR schema (the `TransactionEnvelope`
//    union definition) may ship in exactly ONE client chunk: a second copy means a
//    second Stellar SDK (e.g. the passkey-kit barrel pulling PasskeyServer →
//    @openzeppelin/relayer-plugin-channels → full @stellar/stellar-sdk + axios).
//    Copies are also counted INSIDE a chunk: the prebuilt UMD `stellar-sdk-minimal.min.js`
//    embeds its own stellar-base, so it can hide a second XDR next to the shared one
//    (see the `@stellar/stellar-sdk/minimal` alias in astro.config.mjs).
//    Rolldown/Oxc minification (Astro 7 / Vite 8) may emit string literals as template literals.
//    Zero copies fails too: the fingerprint no longer matches, so the gate would pass vacuously.
const XDR_SCHEMA_RE = /["'`]TransactionEnvelope["'`]\s*,\s*\{\s*switchOn/g;
const xdrCopies = new Map();
for (const file of jsFiles) {
  const copies = (contents.get(file) ?? '').match(XDR_SCHEMA_RE)?.length ?? 0;
  if (copies > 0) xdrCopies.set(file, copies);
}
const xdrChunks = [...xdrCopies.keys()];
const xdrTotal = [...xdrCopies.values()].reduce((a, b) => a + b, 0);
console.log(
  `\nStellar XDR schema: ${xdrTotal} cop${xdrTotal === 1 ? 'y' : 'ies'} in ${xdrChunks.length} chunk(s) (${[...xdrCopies].map(([f, n]) => `${f}×${n}`).join(', ') || 'none'})`
);
if (xdrTotal === 0) {
  failures.push('Stellar XDR (TransactionEnvelope) schema found in 0 client chunks (exactly 1 required)');
}
if (xdrChunks.length > 1) {
  failures.push(`Stellar XDR (TransactionEnvelope) is bundled in ${xdrChunks.length} chunks (max 1): ${xdrChunks.join(', ')}`);
}
if (xdrTotal > 1) {
  failures.push(`Stellar XDR (TransactionEnvelope) schema is bundled ${xdrTotal} times (max 1)`);
}
// 3b. Server-only / HTTP-client gate. Precise markers, no count-based allowances.
//     Every marker is a string that survives minification (string literals,
//     property keys, `Symbol.toStringTag` values).
//
//   (a) OZ Channels client + passkey-kit's PasskeyServer are server-only.
//   (b) The `axios` npm package must contribute ZERO bytes to any client chunk.
//       `AxiosError` is deliberately NOT a marker: @stellar/stellar-sdk@14's RPC
//       client bundles `feaxios`, a ~10 KB fetch shim that defines its OWN local
//       `AxiosError` / `isAxiosError` (no axios code). That shim is allowed until
//       the SDK 16/17 wave; the markers below are axios-only (none occurs in
//       feaxios or the SDK's own http-client; e.g. `CancelToken` is NOT usable —
//       the SDK fetch client defines its own). Section 3c backs them with
//       Rollup's rendered module ids.
//   (c) >1 XDR schema chunk/copy is gated above (section 3).
const CHANNELS_MARKERS = [
  'ChannelsClient',
  'PluginTransportError',
  'baseUrl is required when pluginId is not provided',
];
const PASSKEY_SERVER_MARKERS = ['Mercury service not configured', 'get_signers_by_address', 'zephyr/execute'];
const AXIOS_PACKAGE_MARKERS = [
  'AxiosHeaders', // class + Symbol.toStringTag value
  'silentJSONParsing', // defaults.transitional
  'ERR_DEPRECATED', // axios-only AxiosError code
  'formSerializer', // axios defaults / toFormData options
  'HttpStatusCode', // axios.HttpStatusCode
  'ERR_FR_TOO_MANY_REDIRECTS', // follow-redirects (node http adapter)
  'axios/dist', // a direct dist import
];

const feaxiosChunks = [];
for (const [file, text] of contents) {
  for (const marker of CHANNELS_MARKERS) {
    if (text.includes(marker)) failures.push(`OZ Channels client ("${marker}") in client chunk ${file}`);
  }
  for (const marker of PASSKEY_SERVER_MARKERS) {
    if (text.includes(marker)) failures.push(`passkey-kit PasskeyServer ("${marker}") in client chunk ${file}`);
  }
  for (const marker of AXIOS_PACKAGE_MARKERS) {
    if (text.includes(marker)) failures.push(`axios npm package ("${marker}") in client chunk ${file}`);
  }
  if (text.includes('AxiosError')) feaxiosChunks.push(file);
}
// The feaxios shim is part of the Stellar SDK's RPC client: it may only live in
// the single SDK (XDR) chunk, never as a separately bundled HTTP client.
for (const file of feaxiosChunks) {
  if (!xdrChunks.includes(file)) failures.push(`AxiosError-bearing code outside the Stellar SDK chunk: ${file}`);
}
console.log(
  `axios npm package: 0 bytes required in client chunks (${AXIOS_PACKAGE_MARKERS.length} markers); ` +
    `SDK feaxios shim allowed in: ${feaxiosChunks.join(', ') || 'none'}`
);

// 3c. Rendered-module gate. String markers can miss a single axios helper
//     (e.g. `axios/lib/helpers/combineURLs.js`). The build plugin in astro.config.mjs records,
//     per emitted client chunk, the module ids Rollup actually RENDERED into it
//     (`renderedLength > 0`) in `.astro/client-bundle-modules.json` (build-only, never in
//     dist/). Zero rendered modules may come from these packages in ANY client chunk:
const FORBIDDEN_CLIENT_MODULES = [
  { name: 'axios npm package', test: (id) => /(?:^|\/)node_modules\/axios\//.test(id) },
  {
    name: 'OZ Channels client (@openzeppelin/relayer-plugin-channels)',
    test: (id) => /(?:^|\/)node_modules\/@openzeppelin\/relayer-plugin-channels\//.test(id),
  },
  {
    name: 'passkey-kit server (PasskeyServer) / barrel',
    test: (id) => /(?:^|\/)node_modules\/passkey-kit\/(?:(?:src|dist)\/server(?:\.[cm]?[jt]s)?$|src\/index\.ts$|dist\/)/.test(id),
  },
];
/** The SDK's own feaxios shim: allowed, but only inside the single SDK (XDR) chunk. */
const isFeaxiosModule = (id) => /(?:^|\/)node_modules\/feaxios\//.test(id);

if (moduleReportError) {
  failures.push(`Missing/unreadable ${CLIENT_MODULES_REPORT} (run \`pnpm build\`): ${moduleReportError.message}`);
}
if (moduleReport) {
  const reported = moduleReport.chunks ?? {};
  // The report must describe THIS dist: every emitted client JS chunk is in it (a stale
  // report from another build fails instead of vacuously passing).
  const missing = jsFiles.filter((file) => !Array.isArray(reported[file]));
  if (missing.length) {
    failures.push(`client-bundle-modules.json is stale: no rendered-module entry for ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}`);
  }
  for (const [file, ids] of Object.entries(reported)) {
    if (!contents.has(file) && ids.length > 0) {
      failures.push(`client-bundle-modules.json is stale: ${file} has rendered modules but is not in dist/client/_astro`);
    }
  }
  let moduleCount = 0;
  const feaxiosModuleChunks = new Set();
  for (const [file, ids] of Object.entries(reported)) {
    for (const id of ids) {
      moduleCount++;
      for (const rule of FORBIDDEN_CLIENT_MODULES) {
        if (rule.test(id)) failures.push(`${rule.name}: rendered module ${id} in client chunk ${file}`);
      }
      if (isFeaxiosModule(id)) feaxiosModuleChunks.add(file);
    }
  }
  for (const file of feaxiosModuleChunks) {
    if (!xdrChunks.includes(file)) failures.push(`feaxios module rendered outside the Stellar SDK chunk: ${file}`);
  }
  console.log(
    `Rendered client modules: ${moduleCount} in ${Object.keys(reported).length} chunk(s); ` +
      `0 allowed from axios / @openzeppelin/relayer-plugin-channels / passkey-kit server; ` +
      `feaxios rendered in: ${[...feaxiosModuleChunks].join(', ') || 'none'}`
  );
}

// 4. Lazy wallet payload: everything statically reachable from the passkey-kit
//    wrapper chunk (Stellar SDK + passkey-kit + their shared deps). Was ~664 KB gz
//    with the duplicate SDK; ~197 KB gz after FE-1; must stay <= 200 KB gz.
const WALLET_BUDGET_KB = 200;
const walletEntries = findEntry('passkey-kit');
if (walletEntries.length === 0) {
  failures.push('No passkey-kit wallet chunk found');
} else {
  const closure = getClosure(walletEntries);
  let raw = 0;
  let gz = 0;
  for (const file of closure) {
    raw += rawSizes.get(file) ?? 0;
    gz += gzSizes.get(file) ?? 0;
  }
  console.log(
    `Lazy wallet payload (passkey-kit closure): ${closure.size} chunks | ${(raw / 1024).toFixed(1)} KB raw | ${(gz / 1024).toFixed(1)} KB gz (budget <= ${WALLET_BUDGET_KB} KB gz)`
  );
  if (gz / 1024 > WALLET_BUDGET_KB) {
    failures.push(`Lazy wallet payload is ${(gz / 1024).toFixed(1)} KB gzip (budget <= ${WALLET_BUDGET_KB} KB gzip).`);
  }
}

// 5. List top 10 largest client chunks overall for visibility
const sorted = [...jsFiles]
  .sort((a, b) => (rawSizes.get(b) ?? 0) - (rawSizes.get(a) ?? 0))
  .slice(0, 10);
console.log('\nTop 10 client JS chunks (including lazy-loaded Web3/builder chunks):');
for (const file of sorted) {
  console.log(
    `  ${file.padEnd(42)} ${(rawSizes.get(file) / 1024).toFixed(1).padStart(7)} KB raw | ${(gzSizes.get(file) / 1024).toFixed(1).padStart(6)} KB gz`
  );
}

// 6. Verify zero raw alert/confirm/prompt calls in src/ (strip string literals & comments first)
function walkSrc(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSrc(full));
    else if (/\.(ts|js|svelte|astro)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const DIALOG_RE = /(?:^|[^\w.$'"`])(?:window\.)?(?:alert|confirm|prompt)\s*\(/m;
for (const file of walkSrc(SRC_DIR)) {
  const raw = readFileSync(file, 'utf8');
  const withoutStrings = raw
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '""')
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, '""')
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""');
  if (DIALOG_RE.test(withoutStrings)) {
    failures.push(
      `Raw browser dialog (alert/confirm/prompt) found in ${file.replace(ROOT + '/', '')}`
    );
  }
}

// 7. Verify single @stellar/stellar-sdk version in pnpm-lock.yaml
const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8');
const sdkVersions = new Set(
  [...lockfile.matchAll(/'@stellar\/stellar-sdk@([^']+)'/g)].map((m) => m[1])
);
console.log(`\n@stellar/stellar-sdk versions in lockfile: ${[...sdkVersions].join(', ') || 'none'}`);
if (sdkVersions.size > 1) {
  failures.push(
    `Multiple @stellar/stellar-sdk versions in pnpm-lock.yaml: ${[...sdkVersions].join(', ')}`
  );
}

// 8. Generated Workers + Static Assets config (scripts/check-worker-config.mjs).
{
  const worker = checkWorkerConfig();
  console.log('');
  for (const line of worker.summary) console.log(line);
  failures.push(...worker.failures);
}

if (warnings.length > 0) {
  console.warn('\nWARNINGS:');
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (failures.length > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nPASS: All bundle closure, budget, single-XDR, wallet-payload, dedupe, dialog hygiene, and Worker config gates passed.');
