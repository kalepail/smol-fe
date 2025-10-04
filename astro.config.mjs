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
  adapter: cloudflare(),
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
    define: {
      "process.env": process.env
    },
    plugins: [
      nodePolyfills({
        include: ['buffer']
      }),
      mkcert(),
      tailwindcss()
    ],
  },
});