// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
// import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [svelte()],
  adapter: cloudflare({
    imageService: 'passthrough',
    // Astro dev uses PUBLIC_API_URL. Wrangler Pages supplies deployed bindings.
    platformProxy: { enabled: false },
  }),
  server: {
    host: 'app.smol.xyz'
  },
  vite: {
    // optimizeDeps: {
    //   esbuildOptions: {
    //     define: {
    //       global: 'globalThis',
    //     },
    //     plugins: [
    //       nodeModulesPolyfillPlugin()
    //     ]
    //   }
    // },
    plugins: [
      nodePolyfills({
        include: ['buffer']
      }),
      ...(process.env.SMOL_E2E ? [] : [mkcert()]),
      tailwindcss()
    ],
  },
});
