// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import svelte from '@astrojs/svelte';
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), svelte()],
  adapter: cloudflare(),
  vite: {
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
        plugins: [
          // @ts-ignore
          nodeModulesPolyfillPlugin()
        ]
      }
    },
  },
});