import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ASTRO_DIR = join(ROOT, 'dist', '_astro');
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
    name: 'svelte-dnd-action',
    test: (s) => s.includes('SHADOW_PLACEHOLDER_ITEM_ID') || s.includes('dndzone'),
  },
];

const shellEntries = [
  ...findEntry('TopBar'),
  ...findEntry('PlayerDock'),
  ...findEntry('TabBar'),
  ...findEntry('MixtapeBuilderOverlay'),
  ...findEntry('ClientRouter'),
  ...findEntry('client'),
];

const routes = [
  { name: '/ (Home)', entries: [...shellEntries, ...findEntry('Home')] },
  { name: '/[id] & /create (Smol)', entries: [...shellEntries, ...findEntry('Smol')] },
  { name: '/mixtapes/[id]', entries: [...shellEntries, ...findEntry('MixtapeDetailView')] },
  { name: '/mixtapes', entries: [...shellEntries, ...findEntry('MixtapesIndex')] },
  { name: '/search', entries: [...shellEntries, ...findEntry('SearchResults')] },
  { name: '/artists/[address]', entries: [...shellEntries, ...findEntry('ArtistPage')] },
  {
    name: '/playlist/[playlist]',
    entries: [...shellEntries, ...findEntry('Leaderboard'), ...findEntry('Home')],
  },
];

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
console.log('=== SMOL Transitive Static Import Closure Report (dist/_astro) ===');
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

  if (route.name === '/ (Home)' && totalGz > 60 * 1024) {
    failures.push(
      `Home route static JS closure is ${(totalGz / 1024).toFixed(1)} KB gzip (budget <= 60.0 KB gzip).`
    );
  }
}

// 3. List top 10 largest client chunks overall for visibility
const sorted = [...jsFiles]
  .sort((a, b) => (rawSizes.get(b) ?? 0) - (rawSizes.get(a) ?? 0))
  .slice(0, 10);
console.log('\nTop 10 client JS chunks (including lazy-loaded Web3/builder chunks):');
for (const file of sorted) {
  console.log(
    `  ${file.padEnd(42)} ${(rawSizes.get(file) / 1024).toFixed(1).padStart(7)} KB raw | ${(gzSizes.get(file) / 1024).toFixed(1).padStart(6)} KB gz`
  );
}

// 4. Verify zero raw alert/confirm/prompt calls in src/ (strip string literals & comments first)
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

// 5. Verify single @stellar/stellar-sdk version in pnpm-lock.yaml
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

if (failures.length > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nPASS: All bundle closure, budget, dedupe, and dialog hygiene gates passed.');
