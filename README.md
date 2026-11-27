# SMOL Frontend (`smol.xyz`)

Web frontend for [SMOL](https://smol.xyz) — AI music generation, mixtapes, and Stellar/Soroban song collectibles. Built with **Astro 7**, **Svelte 5** (runes), **Tailwind CSS 4**, and **Cloudflare Workers with Static Assets** (`@astrojs/cloudflare` 14).

## Features

- **Music generation (`/create`):** Classic (`aisonggenerator v6`, 2 takes, ~2–6 min) and ElevenLabs (`music_v2_5`, 1 take, ~1 min) with live daily quotas, mode-aware prompt limits (`2,280` lyrical / `380` instrumental), Public/Private visibility, Remix prompt, and live step progress.
- **Track pages (`/[id]`):** Single-take (`m:ss` in hero meta) and multi-take (`Use as main take` + per-take durations) playback, expandable lyrics, style chips, private-song `noindex`, and mint/trade actions.
- **Mixtapes (`/mixtapes`, `/mixtapes/[id]`):** Public gallery, local autosaved draft builder, Play All, and batch song collection. Collect approvals require Web Locks for cross-tab coordination.
- **Library & discovery:** Home feed (`/`), semantic public search (`/search`), owner-scoped `/created?q=` filter (including private songs), `/liked`, `/artists/[address]`, `/playlist/[id]`, and `/account` (inline KALE balance + Send KALE).
- **Passkey smart wallets:** Passwordless WebAuthn authentication via `passkey-kit@0.12.0` + Stellar SDK `14.4.3` + Soroban contract bindings (`ext/smol-sdk`, `ext/comet-sdk`).

## Development

Requires **Node.js 22.19+** and **pnpm 10+**.

```sh
pnpm install
pnpm dev              # Local HTTPS dev server (https://app.smol.xyz)
pnpm check            # Astro sync + svelte-check
pnpm test:unit        # Node unit tests
pnpm test:e2e         # Playwright E2E suite
pnpm build            # Build dist/client/ + dist/server/wrangler.json
pnpm check:bundle     # Route budgets (Home warns above 70 KB gzip) + Worker config
pnpm test:e2e:worker  # Built-Worker smoke test in workerd (run after build)
```

Configure `.env` from `.env.example` (`PUBLIC_RPC_URL`, `PUBLIC_NETWORK_PASSPHRASE`, `PUBLIC_WALLET_WASM_HASH`, `PUBLIC_RELAYER_URL`, `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_API_URL`, `PUBLIC_KALE_SAC_ID`, `PUBLIC_SMOL_CONTRACT_ID`).

## Deployment

Deployed to `smol.xyz` as a Cloudflare Worker with Static Assets via `wrangler deploy` using the generated `dist/server/wrangler.json` (sourced from `wrangler.jsonc` with `SMOL_API` service binding to `smol-workflow`).

## License

See [LICENSE](./LICENSE).
