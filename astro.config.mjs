// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
// import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://noot.smol.xyz',
  output: 'server',
  integrations: [svelte(), sitemap()],
  adapter: cloudflare(),
  server: {
    host: 'localhost'
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
        include: ['buffer', 'crypto', 'stream', 'util', 'process', 'vm'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      // mkcert(),
      tailwindcss()
    ],
    define: {
      self: 'globalThis'
    }
  },
});// touch
