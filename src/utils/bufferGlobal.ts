/**
 * Buffer for the LAZY chain/wallet modules only (replaces vite-plugin-node-polyfills).
 *
 * `@stellar/stellar-sdk/minimal/{contract,rpc}` (CJS `lib/`) and `base64url`
 * (used by passkey-kit) reference a bare global `Buffer` at call time. Every
 * module that imports the Stellar SDK, smol-sdk, comet-sdk or passkey-kit
 * imports this file first, so the global exists before any SDK call — and
 * because only lazy (dynamically imported) modules import it, the `buffer`
 * polyfill never reaches the initial shell / Home closure.
 *
 * The generated contract bindings (sac-sdk, passkey-kit-sdk, comet-sdk, smol-sdk)
 * also set `window.Buffer` when they evaluate; this module makes the global
 * independent of which lazy module happens to load first.
 *
 * Our own call sites import `Buffer` explicitly from here (or from 'buffer').
 */
import { Buffer } from 'buffer';

const g = globalThis as typeof globalThis & { Buffer?: unknown };
if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer;
}

export { Buffer };
