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

/**
 * PUBLIC_* precedence: explicit process.env (shell, CI, Playwright webServer env) > `.env` >
 * wrangler.jsonc `vars` (the production defaults). @astrojs/cloudflare copies the Wrangler `vars`
 * (merged with `.dev.vars` / `.env`) onto process.env in its `astro:config:done` hook, overwriting
 * keys that were already set; adapter hooks run first, so this integration re-applies the explicit
 * values afterwards. Vite then inlines `import.meta.env.PUBLIC_*` from process.env at build time.
 *
 * @returns {import('astro').AstroIntegration}
 */
function explicitPublicEnvWins() {
  const explicit = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('PUBLIC_')));
  return {
    name: 'smol:explicit-public-env',
    hooks: { 'astro:config:done': () => void Object.assign(process.env, explicit) },
  };
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
  // Astro sessions are unused: `false` keeps @astrojs/cloudflare from adding a SESSION KV binding
  // to the generated dist/server/wrangler.json.
  session: false,
  integrations: [svelte(), explicitPublicEnvWins()],
  adapter: cloudflare({
    // No Cloudflare Images binding: images are served as-is.
    imageService: 'passthrough',
  }),
  server: {
    host: 'app.smol.xyz',
  },
  vite: {
    resolve: {
      alias: [{ find: /^@stellar\/stellar-sdk\/minimal$/, replacement: stellarBaseDir }],
    },
    // The lazy wallet/chain chunk (one Stellar SDK + XDR, ~536 KB raw) is gated by
    // scripts/check-bundle.mjs (wallet <= 200 KB gz, exactly one XDR copy) instead.
    build: { chunkSizeWarningLimit: 600 },
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
