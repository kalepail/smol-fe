# Smol Frontend

This project is the web interface for the **Smol** music generator. It uses [Astro](https://astro.build/) with Svelte components and connects to Soroban smart contracts through locally generated SDKs.

## Getting Started

Install dependencies and start the local dev server:

```bash
pnpm install
pnpm run dev
```

Build for production:

```bash
pnpm run build
```

Run a preview of the build output:

```bash
pnpm run preview
```

The app relies on several environment variables for RPC connections and API endpoints. Set at least the following in your environment before running locally or deploying:

- `PUBLIC_RPC_URL`
- `PUBLIC_NETWORK_PASSPHRASE`
- `PUBLIC_API_URL`
- `PUBLIC_WALLET_WASM_HASH`
- `PUBLIC_LAUNCHTUBE_URL`
- `PUBLIC_LAUNCHTUBE_JWT`

## Project Structure

```
/
├── src/            Application source code
│   ├── components/ Svelte components used on pages
│   ├── layouts/    Astro layouts (main HTML shell)
│   ├── pages/      Astro pages that mount Svelte components
│   ├── store/      Small Svelte stores (keyId, contractId, etc.)
│   ├── styles/     Tailwind-based global CSS
│   └── utils/      Utilities for blockchain interaction
├── ext/            Generated Soroban SDKs
│   ├── smol-sc-sdk/
│   └── fp-sdk/
├── public/         Static assets and site manifest
└── package.json    Project metadata and scripts
```

### Local SDKs

Under `ext/` you will find two folders (`smol-sc-sdk` and `fp-sdk`). These contain TypeScript clients generated from the corresponding Soroban smart contracts. Their READMEs explain how to regenerate the bindings if the contracts are updated.

## Next Steps

- Review the Svelte components (`src/components/`) to learn how the UI interacts with the stores and the blockchain.
- Explore `src/utils/passkey-kit.ts` to understand wallet creation and transaction signing using PasskeyKit.
- Check the SDKs in `ext/` for the contract methods available.
- Read the comments in components like `Home.svelte` and `Smol.svelte` for hints on upcoming features and workflow.

Enjoy building with Smol!

