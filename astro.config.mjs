// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
// import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
const isBuild = process.argv.includes('build');

export default defineConfig({
  site: 'https://noot.smol.xyz',
  output: 'server',
  integrations: [svelte(), sitemap()],
  adapter: cloudflare(),
  server: {
    host: 'localhost'
  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^pino$/,
          replacement: fileURLToPath(new URL('./src/shims/pino.ts', import.meta.url)),
        },
      ],
    },
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
    optimizeDeps: {
      // ZK dungeon uses snarkjs + circomlibjs in the browser. These are dynamically imported
      // at runtime; without an explicit include, Vite may attempt on-demand optimization
      // and temporarily serve a 504 "Outdated Optimize Dep" which breaks Playwright/e2e.
      include: ['snarkjs', 'circomlibjs'],
      exclude: ['@aztec/bb.js'],
      // @aztec/bb.js (UltraHonk verifier) uses top-level await in its browser build.
      // Vite's default "modules" target includes browsers that don't support it,
      // so esbuild refuses to prebundle without this override.
      esbuildOptions: {
        supported: {
          'top-level-await': true,
        },
      },
    },
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
    build: {
      rollupOptions: {
        external: [
          '@noir-lang/noir_js',
          '@noir-lang/backend_barretenberg',
        ],
      },
    },
    // Some dependencies (notably stellar-sdk-minimal's browser bundle) reference `self` and are
    // executed during prerender in Node. In dev, Vite injects defines via `env.mjs`, which would
    // attempt to assign to `self` inside workers (read-only) and break bb.js. Keep this build-only.
    define: isBuild ? { self: 'globalThis' } : undefined,
  },
});// touch
