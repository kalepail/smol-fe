// @ts-check
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

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
    plugins: [
      nodePolyfills({
        include: ['buffer'],
      }),
      ...(useMkcert ? [mkcert()] : []),
      tailwindcss(),
    ],
  },
});
