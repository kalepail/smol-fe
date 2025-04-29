// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [svelte()],
  adapter: cloudflare(),
  vite: {
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
        plugins: [
          nodeModulesPolyfillPlugin()
        ]
      }
    },
    plugins: [
      mkcert(),
      tailwindcss()
    ],
  },
});