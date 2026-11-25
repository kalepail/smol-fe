// @ts-check
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';

// Cloudflare Pages with wrangler.jsonc supersedes dashboard env vars and only injects
// wrangler vars into Functions runtime, not always into the Vite build step.
// Populate missing PUBLIC_* env vars from wrangler.jsonc vars so builds stay self-contained
// while explicit process.env / .env overrides (including E2E fixtures) always win.
try {
  const wrangler = JSON.parse(fs.readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries(wrangler.vars ?? {})) {
    if (key.startsWith('PUBLIC_') && typeof value === 'string' && !process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // Ignore if wrangler.jsonc is absent or non-JSON
}

const useMkcert = !process.env.SMOL_E2E && !process.argv.includes('build');

// One Stellar XDR copy in the browser. `@stellar/stellar-sdk/minimal` resolves (browser
// condition) to the prebuilt UMD `dist/stellar-sdk-minimal.min.js`, which embeds its OWN
// stellar-base + XDR, while `/minimal/contract` and `/minimal/rpc` (CJS `lib/`) require the
// shared `@stellar/stellar-base` package. Every browser import of the `/minimal` root uses
// stellar-base symbols only (StrKey, xdr, Address, Asset, hash, ...: see
// tests/unit/stellarBaseAlias.test.ts), so it resolves to that same stellar-base module.
const sdkRequire = createRequire(createRequire(import.meta.url).resolve('@stellar/stellar-sdk/minimal/contract'));
const stellarBaseDir = path.dirname(sdkRequire.resolve('@stellar/stellar-base/package.json'));

// Build-only report of the modules Rollup actually RENDERED into each emitted client chunk
// (`chunk.modules[id].renderedLength > 0`). scripts/check-bundle.mjs gates on these module ids
// (zero axios / OZ Channels / passkey-kit server modules in any client chunk), which string
// markers alone cannot prove. Written to `.astro/` (gitignored, never deployed), NOT dist/.
const CLIENT_MODULES_REPORT = fileURLToPath(new URL('./.astro/client-bundle-modules.json', import.meta.url));
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * @typedef {{ type: 'chunk', fileName: string, modules: Record<string, { renderedLength: number }> }} RenderedChunk
 * @typedef {RenderedChunk | { type: 'asset', fileName: string }} OutputItem
 */
function clientModulesReport() {
  return {
    name: 'smol:client-modules-report',
    apply: /** @type {const} */ ('build'),
    /**
     * @this {{ environment?: { name?: string } }}
     * @param {unknown} _options
     * @param {Record<string, OutputItem>} bundle
     */
    generateBundle(_options, bundle) {
      // Astro runs separate SSR and client builds: record the client one only.
      const env = this.environment?.name;
      if (env && env !== 'client') return;
      /** @type {Record<string, string[]>} */
      const chunks = {};
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.fileName.startsWith('_astro/')) continue;
        chunks[output.fileName.slice('_astro/'.length)] = Object.entries(output.modules)
          .filter(([, mod]) => mod.renderedLength > 0)
          .map(([id]) => {
            const clean = id.replace(/^\0/, '').split('?')[0];
            return path.isAbsolute(clean) ? path.relative(projectRoot, clean).split(path.sep).join('/') : clean;
          })
          .sort();
      }
      if (Object.keys(chunks).length === 0) return;
      fs.mkdirSync(path.dirname(CLIENT_MODULES_REPORT), { recursive: true });
      fs.writeFileSync(CLIENT_MODULES_REPORT, `${JSON.stringify({ chunks }, null, 1)}\n`);
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  devToolbar: {
    enabled: !process.env.SMOL_E2E,
  },
  integrations: [svelte()],
  adapter: cloudflare({
    imageService: 'passthrough',
    // Astro dev uses PUBLIC_API_URL. Wrangler Pages supplies deployed bindings.
    platformProxy: { enabled: false },
  }),
  server: {
    host: 'app.smol.xyz',
  },
  vite: {
    resolve: {
      alias: [{ find: /^@stellar\/stellar-sdk\/minimal$/, replacement: stellarBaseDir }],
    },
    plugins: [
      ...(useMkcert ? [mkcert()] : []),
      tailwindcss(),
      clientModulesReport(),
    ],
    // Dev only: these are reached through dynamic imports (chain reads, wallet), so Vite would
    // discover them mid-session and re-optimize, leaving open pages with two Svelte runtimes
    // (`effect_orphan` / `lifecycle_outside_component`). Pre-bundling them up front keeps the
    // first optimization final. No effect on production builds.
    optimizeDeps: {
      include: [
        '@stellar/stellar-sdk/minimal',
        '@stellar/stellar-sdk/minimal/contract',
        '@stellar/stellar-sdk/minimal/rpc',
        'passkey-kit/src/kit',
        'passkey-kit/src/sac',
        'buffer',
      ],
    },
  },
});
