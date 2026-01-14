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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
