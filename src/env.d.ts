/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_KALE_SAC_ID: string;
  readonly PUBLIC_NETWORK_PASSPHRASE: string;
  readonly PUBLIC_RPC_URL: string;
  readonly PUBLIC_SMOL_CONTRACT_ID: string;
  readonly PUBLIC_WALLET_WASM_HASH: string;
  // Relayer proxy URL (uses Turnstile for authentication)
  readonly PUBLIC_RELAYER_URL: string;
  // Turnstile site key for bot protection
  readonly PUBLIC_TURNSTILE_SITE_KEY: string;
  // Opt-in: smol-workflow POST /chain/snapshot (Report 31). Falls back to batched getLedgerEntries.
  readonly PUBLIC_CHAIN_SNAPSHOT?: string;
  // Opt-in: smol-workflow POST /mint/status. Auto-detected (404 → chain fallback) when unset.
  readonly PUBLIC_MINT_STATUS?: string;
  // '1' / '0' to assert getLedgerEntries archive capability; unset → getVersionInfo (protocol ≥ 23).
  readonly PUBLIC_RPC_ARCHIVE_AWARE?: string;
  // E2E only (Playwright dev server): enables src/utils/collectSeams.ts boundary substitutes.
  readonly PUBLIC_E2E_SEAMS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The Worker bindings this app reads through `import { env } from 'cloudflare:workers'`
// (src/services/api/ssr.ts). Declared here instead of pulling in @cloudflare/workers-types,
// whose global Request/Response types clash with the DOM lib the islands use.
declare module 'cloudflare:workers' {
  export const env: {
    /** Service binding to smol-workflow (wrangler.jsonc `services`). Unused under `astro dev`. */
    readonly SMOL_API?: { fetch(request: Request): Promise<Response> };
  };
}
