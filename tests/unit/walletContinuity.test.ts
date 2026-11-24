import './helpers/nodeModulesTs.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Networks } from '@stellar/stellar-sdk/minimal';

/**
 * Wallet-continuity golden: the passkey-kit@0.12.0 subpath the browser now
 * imports (`passkey-kit/src/kit`, NOT the barrel) must derive the exact same
 * wallet contract id for a credential as smol-workflow's server-side
 * `derivePasskeyKitContractId` (src/passkey.ts). The expected ids below were
 * produced by running that smol-workflow function on the same key ids; if they
 * ever diverge, returning SMOL users would be connected to the wrong wallet.
 */
const PUBLIC_WALLET_WASM_HASH = 'e45c42b944a767bd5f37f8c4a469b48917d28e23481dbfd550419c84cdacde92';

const GOLDEN: Array<{ keyIdHex: string; keyIdBase64: string; contractId: string }> = [
  {
    keyIdHex: '11223344556677889900aabbccddeeff',
    keyIdBase64: 'ESIzRFVmd4iZAKq7zN3u_w',
    contractId: 'CAAKFA6J32BJDCSN7D5S2T4UXHCIXO5UH67HZXL3ZD26OL4AP2QKXD54',
  },
  {
    keyIdHex: 'aabbccddeeff00112233445566778899',
    keyIdBase64: 'qrvM3e7_ABEiM0RVZneImQ',
    contractId: 'CDSN3FQIGNW2DOJSGPK75VYRNEAPYWNILF2A6XAUNMGDMBY6ZUO7YZ2P',
  },
  {
    keyIdHex: 'a4f0c2e7b9d1350f6e8a2c4b7d9e1f3a5c7e9b1d3f5a7c9e',
    keyIdBase64: 'pPDC57nRNQ9uiixLfZ4fOlx-mx0_Wnye',
    contractId: 'CABFRF4HDKLZRZJNPYY7PTOTPQPUZAYOYPWGP6ZNFGI4GDJEP226CQHF',
  },
  {
    keyIdHex: Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 37 + 11) & 0xff)).toString('hex'),
    keyIdBase64: 'CzBVep_E6Q4zWH2ix-wRNluApcrvFDleg6jN8hc8YYar0PUaP2SJrtP4HUJnjLHW-yBFao-02f4jSG2St9wBJg',
    contractId: 'CAYWEJNY6LLNM4QP4E2AZYY2MLULJVTTXG5KAUQDPGFPBC7K77URHJQC',
  },
];

async function makeKit() {
  const { PasskeyKit } = await import('passkey-kit/src/kit');
  const kit = new PasskeyKit({
    rpcUrl: 'https://rpc.invalid',
    networkPassphrase: Networks.PUBLIC,
    walletWasmHash: PUBLIC_WALLET_WASM_HASH,
    timeoutInSeconds: 30,
  });
  const probed: string[] = [];
  // Pretend every derived instance exists on-chain (no network in unit tests).
  (kit.rpc as unknown as { getContractData: (id: string) => Promise<object> }).getContractData = async (id) => {
    probed.push(id);
    return {};
  };
  return { kit, probed };
}

test('browser passkey-kit subpath derives the same wallet ids as smol-workflow (base64url key id)', async () => {
  for (const g of GOLDEN) {
    const { kit, probed } = await makeKit();
    const result = await kit.connectWallet({ keyId: g.keyIdBase64 });
    assert.equal(result.contractId, g.contractId, `key ${g.keyIdBase64}`);
    assert.equal(result.keyIdBase64, g.keyIdBase64);
    assert.equal(Buffer.from(result.keyId).toString('hex'), g.keyIdHex);
    assert.deepEqual(probed, [g.contractId], 'derivation probe hits exactly the golden id');
  }
});

test('raw Uint8Array key ids derive identically (createWallet/connectWallet byte path)', async () => {
  for (const g of GOLDEN) {
    const { kit } = await makeKit();
    const result = await kit.connectWallet({ keyId: new Uint8Array(Buffer.from(g.keyIdHex, 'hex')) });
    assert.equal(result.contractId, g.contractId);
    assert.equal(result.keyIdBase64, g.keyIdBase64);
  }
});

test('the deployed config and the browser wrapper pin the audited wasm hash and the subpath import', () => {
  const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, new RegExp(`"PUBLIC_WALLET_WASM_HASH":\\s*"${PUBLIC_WALLET_WASM_HASH}"`));

  const wrapper = readFileSync(new URL('../../src/utils/passkey-kit.ts', import.meta.url), 'utf8');
  assert.match(wrapper, /from 'passkey-kit\/src\/kit'/);
  assert.match(wrapper, /from 'passkey-kit\/src\/sac'/);
  assert.doesNotMatch(wrapper, /from 'passkey-kit'/, 'the barrel re-exports PasskeyServer → full SDK + axios');

  const pkg = JSON.parse(readFileSync(new URL('../../node_modules/passkey-kit/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, '0.12.0', 'passkey-kit 0.20 rejects returning SMOL wallets (LegacyWalletError)');
});
