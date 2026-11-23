// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

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
