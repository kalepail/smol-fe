/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_AUDIO_PROXY_URL?: string; // Optional - if set, audio streams through this for CORS visualizer
  readonly PUBLIC_KALE_SAC_ID: string;
  readonly PUBLIC_LAUNCHTUBE_JWT?: string;  // Optional - deprecated fallback
  readonly PUBLIC_LAUNCHTUBE_URL?: string;  // Optional - deprecated fallback
  readonly PUBLIC_NETWORK_PASSPHRASE: string;
  readonly PUBLIC_WEBAUTHN_VERIFIER_ADDRESS: string;
  readonly PUBLIC_RPC_URL: string;
  readonly PUBLIC_RELAYER_API_KEY?: string;
  readonly PUBLIC_RELAYER_URL?: string;
  readonly PUBLIC_SMOL_CONTRACT_ID: string;
  readonly PUBLIC_WALLET_WASM_HASH: string;
  // OpenZeppelin Channels (not currently implemented - using KaleFarm relayer instead)
  // readonly PUBLIC_CHANNELS_BASE_URL?: string;  // defaults to https://channels.openzeppelin.com
  // readonly PUBLIC_CHANNELS_API_KEY?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
