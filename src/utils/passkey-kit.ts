import './bufferGlobal';
// Subpath imports, NOT the `passkey-kit` barrel: the barrel unconditionally
// re-exports `PasskeyServer` → `@openzeppelin/relayer-plugin-channels` → the
// FULL `@stellar/stellar-sdk` + axios, which shipped a second ~306 KB gz copy of
// the Stellar XDR to every wallet route. The browser only needs the kit + SAC.
import { PasskeyKit } from 'passkey-kit/src/kit';
import { SACClient } from 'passkey-kit/src/sac';
import { AssembledTransaction } from '@stellar/stellar-sdk/minimal/contract';
import type { Tx } from '@stellar/stellar-sdk/minimal/contract';
import { clearTurnstileToken, ensureTurnstileToken } from '../stores/turnstile.svelte';
import { relayXdr } from './relayDispatch';

export const account = new PasskeyKit({
  rpcUrl: import.meta.env.PUBLIC_RPC_URL,
  networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
  walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
  timeoutInSeconds: 30,
});

export const sac = new SACClient({
  rpcUrl: import.meta.env.PUBLIC_RPC_URL,
  networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
});

export const kale = sac.getSACClient(import.meta.env.PUBLIC_KALE_SAC_ID);

export interface SendOptions {
  /**
   * The action's final, SYNCHRONOUS check (e.g. `walletDispatchGuard(ticket)`),
   * run after the Turnstile token resolves and immediately before the relayer
   * POST, with no await in between. If it throws, nothing is sent.
   */
  beforeDispatch?: () => void;
}

export async function send<T>(txn: AssembledTransaction<T> | Tx | string, opts: SendOptions = {}) {
  let xdr: string;
  if (txn instanceof AssembledTransaction) {
    xdr = txn.built!.toXDR();
  } else if (typeof txn !== 'string') {
    xdr = txn.toXDR();
  } else {
    xdr = txn;
  }

  return relayXdr({
    xdr,
    relayerUrl: import.meta.env.PUBLIC_RELAYER_URL,
    getToken: ensureTurnstileToken,
    clearToken: clearTurnstileToken,
    beforeDispatch: opts.beforeDispatch,
  });
}
