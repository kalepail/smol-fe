import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the `@stellar/stellar-sdk/minimal` → `@stellar/stellar-base` alias in
 * astro.config.mjs (one Stellar XDR copy in the browser). The alias is only
 * sound while every browser import of the `/minimal` ROOT names symbols that
 * stellar-base itself exports, with no namespace/default/side-effect imports.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(ROOT, 'package.json'));
const sdkRequire = createRequire(require.resolve('@stellar/stellar-sdk/minimal/contract'));
const stellarBaseDir = dirname(sdkRequire.resolve('@stellar/stellar-base/package.json'));
const base = sdkRequire('@stellar/stellar-base') as Record<string, unknown>;

const kitRequire = createRequire(realpathSync(join(ROOT, 'node_modules/passkey-kit/package.json')));

/** Browser-bundled sources that may import the SDK. */
const SOURCE_DIRS = [
  join(ROOT, 'src'),
  join(ROOT, 'ext/comet-sdk/dist'),
  join(ROOT, 'ext/smol-sdk/dist'),
  realpathSync(join(ROOT, 'node_modules/passkey-kit/src')),
  dirname(kitRequire.resolve('sac-sdk')),
  dirname(kitRequire.resolve('passkey-kit-sdk')),
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') out.push(...walk(full));
    } else if (/\.(ts|js|mjs|svelte)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const ROOT_IMPORT =
  /import\s+((?:type\s+)?\{[^}]*\}|\*\s*as\s+[\w$]+|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+[\w$]+))?)\s*from\s*['"]@stellar\/stellar-sdk\/minimal['"]/g;
const BARE_ROOT_IMPORT = /import\s+['"]@stellar\/stellar-sdk\/minimal['"]/;

test('every browser import of @stellar/stellar-sdk/minimal names a stellar-base export', () => {
  const seen = new Set<string>();
  for (const file of SOURCE_DIRS.flatMap(walk)) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, BARE_ROOT_IMPORT, `${file}: side-effect import`);
    for (const match of text.matchAll(ROOT_IMPORT)) {
      const clause = match[1].trim();
      if (clause.startsWith('type ')) continue;
      assert.match(clause, /^\{[^}]*\}$/, `${file}: only named imports are alias-safe (${clause})`);
      for (const raw of clause.slice(1, -1).split(',')) {
        const spec = raw.trim();
        if (!spec || spec.startsWith('type ')) continue;
        const name = spec.split(/\s+as\s+/)[0].trim();
        seen.add(name);
        assert.ok(name in base, `${file}: '${name}' is not exported by @stellar/stellar-base`);
      }
    }
  }
  assert.ok(seen.has('xdr') && seen.has('StrKey'), 'scan found the real imports');
});

test('the alias target is the same stellar-base package the SDK contract/rpc libs require', () => {
  const config = readFileSync(join(ROOT, 'astro.config.mjs'), 'utf8');
  assert.match(config, /find: \/\^@stellar\\\/stellar-sdk\\\/minimal\$\//);
  const pkg = JSON.parse(readFileSync(join(stellarBaseDir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@stellar/stellar-base');
  const sdkPkg = sdkRequire('../../../package.json') as { version: string; dependencies: Record<string, string> };
  assert.equal(sdkPkg.version.split('.')[0], '14');
  assert.ok(sdkPkg.dependencies['@stellar/stellar-base'], 'SDK declares stellar-base');
});
