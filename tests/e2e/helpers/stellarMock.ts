import type { Page } from '@playwright/test';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { KALE_SAC, derive } from '../../fixtures/collect.mjs';

export interface ChainScenario {
  /** Track ids minted on chain (canonical pair exists). */
  minted: string[];
  /** Holder balance per track id, in stroops. Missing → no balance entry. */
  balances: Record<string, bigint>;
  /** Holder KALE balance in stroops. */
  kale: bigint;
  /** KALE reserve per pool (stroops). Default 100 KALE. */
  kaleReserve?: bigint;
  /** Song-token reserve per pool (stroops). Default 990,000,000 tokens. */
  trackReserve?: bigint;
  /**
   * Serve the pool's `SwapFeeConfig` in its instance storage (exact local quotes).
   * Default true; `false` forces the trade sheet's simulation fallback.
   */
  feeConfig?: boolean;
  /** Every getLedgerEntries call returns HTTP 500 (C-02 regression). */
  fail?: boolean;
  delayMs?: number;
  /** getVersionInfo protocol (≥ 23 ⇒ archive-aware getLedgerEntries). Default 23. */
  protocolVersion?: number;
  /** Track ids whose pool runs an unaudited executable. */
  badExec?: string[];
  /** Encode the holder's KALE amount as u64 (malformed, must never read as a balance). */
  kaleMalformed?: boolean;
  /** Ledger tip reported by getLedgerEntries / getHealth. Default 65,635,400. */
  latestLedger?: number;
  /** KALE balance per holder address (falls back to `kale`). */
  kaleByHolder?: Record<string, bigint>;
  /**
   * Hold matching getLedgerEntries responses until this settles. The scenario
   * is captured when the request ARRIVES, so a held response carries the
   * balances of that moment (an "older" read), whatever changes meanwhile.
   */
  hold?: Promise<unknown>;
}

export const AUDITED_COMET_HASH = '61e1fc5401a7b22418c2bd3bc5bd2c07241e4dae098c587c89f3f666aca12e37';

export interface ChainStats {
  getLedgerEntries: number;
  getVersionInfo: number;
  /** Every contract address whose ledger keys were requested. */
  contracts: Set<string>;
  getLatestLedger: number;
  getHealth: number;
  simulateTransaction: number;
  keys: number[];
}

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const entry = (key: xdr.ScVal, val: xdr.ScVal) => new xdr.ScMapEntry({ key, val });

/** Comet `SwapFeeConfig` (fees in 1e7 units): 0.3%–3% tracked on the KALE reserve. */
function swapFeeConfig() {
  return new xdr.ScMapEntry({
    key: xdr.ScVal.scvVec([sym('SwapFeeConfig')]),
    val: xdr.ScVal.scvMap([
      entry(sym('high_util_balance'), nativeToScVal(100_000_000_000n, { type: 'i128' })),
      entry(sym('low_util_balance'), nativeToScVal(1_000_000_000n, { type: 'i128' })),
      entry(sym('max_fee'), nativeToScVal(300_000n, { type: 'i128' })),
      entry(sym('min_fee'), nativeToScVal(30_000n, { type: 'i128' })),
      entry(sym('tracked_token'), new Address(KALE_SAC).toScVal()),
    ]),
  });
}

function record(balance: bigint, index: number) {
  return xdr.ScVal.scvMap([
    entry(sym('balance'), nativeToScVal(balance, { type: 'i128' })),
    entry(sym('index'), nativeToScVal(index, { type: 'u32' })),
    entry(sym('scalar'), nativeToScVal(10n ** 11n, { type: 'i128' })),
    entry(sym('weight'), nativeToScVal(5_000_000n, { type: 'i128' })),
  ]);
}

/** Serve realistic Soroban RPC JSON for SAC instances, Comet records and SAC balances. */
export async function installStellarMock(page: Page, getScenario: () => ChainScenario): Promise<ChainStats> {
  const emptyStats = (): ChainStats => ({
    getLedgerEntries: 0,
    getVersionInfo: 0,
    contracts: new Set(),
    getLatestLedger: 0,
    getHealth: 0,
    simulateTransaction: 0,
    keys: [],
  });
  const stats = emptyStats();
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  };

  await page.route(/^https:\/\/127\.0\.0\.1:4329\//, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    // Under `astro dev`, Astro's ClientRouter first loads the next page in a hidden iframe (to collect
    // client:only styles); that copy's islands issue their own reads. Serve them, count only the page's.
    const tally = request.frame() === page.mainFrame() ? stats : emptyStats();
    const scenario = getScenario();
    const body = JSON.parse(request.postData() ?? '{}');
    const method = body.method as string;
    if (method in tally) (tally as unknown as Record<string, number>)[method]++;
    if (scenario.delayMs) await new Promise((r) => setTimeout(r, scenario.delayMs));
    if (method === 'getLedgerEntries' && scenario.hold) await scenario.hold;

    if (method === 'getVersionInfo') {
      await route.fulfill({
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { version: '23.0.0', commitHash: 'e2e', buildTimestamp: '', captiveCoreVersion: '', protocolVersion: scenario.protocolVersion ?? 23 } }),
      });
      return;
    }
    if (method === 'getHealth') {
      await route.fulfill({
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { status: 'healthy', latestLedger: scenario.latestLedger ?? 65_635_400, oldestLedger: 2, ledgerRetentionWindow: 0 } }),
      });
      return;
    }
    if (method !== 'getLedgerEntries') {
      await route.fulfill({ status: 500, headers: cors, body: 'unexpected method in e2e' });
      return;
    }
    if (scenario.fail) {
      await route.fulfill({ status: 500, headers: cors, body: 'upstream unavailable' });
      return;
    }

    const minted = new Map(scenario.minted.map((id) => [id, derive(id)]));
    const bySac = new Map([...minted].map(([id, pair]) => [pair.sac, id]));
    const badPools = new Set((scenario.badExec ?? []).map((id) => derive(id).pool));
    const byPool = new Map([...minted].map(([id, pair]) => [pair.pool, id]));
    const keys: string[] = body.params?.keys ?? [];
    tally.keys.push(keys.length);
    const entries = [];
    for (const keyB64 of keys) {
      const key = xdr.LedgerKey.fromXDR(keyB64, 'base64').contractData();
      const contract = Address.fromScAddress(key.contract()).toString();
      tally.contracts.add(contract);
      const k = key.key();
      let val: xdr.ScVal | null = null;

      if (k.switch().value === xdr.ScValType.scvLedgerKeyContractInstance().value) {
        if (bySac.has(contract)) {
          val = xdr.ScVal.scvContractInstance(
            new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableStellarAsset(), storage: null })
          );
        } else if (byPool.has(contract)) {
          const hashHex = badPools.has(contract) ? '00'.repeat(32) : AUDITED_COMET_HASH;
          val = xdr.ScVal.scvContractInstance(
            new xdr.ScContractInstance({
              executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(hashHex, 'hex')),
              storage: scenario.feeConfig === false ? null : [swapFeeConfig()],
            })
          );
        }
      } else if (k.switch().value === xdr.ScValType.scvVec().value) {
        const parts = k.vec() ?? [];
        const name = parts[0]?.sym().toString();
        if (name === 'AllRecordData' && byPool.has(contract)) {
          const pair = minted.get(byPool.get(contract)!)!;
          val = xdr.ScVal.scvMap([
            entry(new Address(KALE_SAC).toScVal(), record(scenario.kaleReserve ?? 1_000_000_000n, 0)),
            entry(new Address(pair.sac).toScVal(), record(scenario.trackReserve ?? 9_900_000_000_000_000n, 1)),
          ]);
        } else if (name === 'Balance') {
          const holder = parts[1] ? Address.fromScVal(parts[1]).toString() : '';
          const kale = scenario.kaleByHolder?.[holder] ?? scenario.kale;
          const amount = contract === KALE_SAC ? kale : bySac.has(contract) ? scenario.balances[bySac.get(contract)!] : undefined;
          if (amount !== undefined) {
            const malformed = contract === KALE_SAC && scenario.kaleMalformed;
            val = xdr.ScVal.scvMap([
              entry(sym('amount'), nativeToScVal(amount, { type: malformed ? 'u64' : 'i128' })),
              entry(sym('authorized'), xdr.ScVal.scvBool(true)),
              entry(sym('clawback'), xdr.ScVal.scvBool(false)),
            ]);
          }
        }
      }

      if (val) {
        const data = xdr.LedgerEntryData.contractData(
          new xdr.ContractDataEntry({
            ext: xdr.ExtensionPoint.fromXDR(Buffer.alloc(4)),
            contract: key.contract(),
            key: k,
            durability: key.durability(),
            val,
          })
        );
        entries.push({ key: keyB64, xdr: data.toXDR('base64'), lastModifiedLedgerSeq: 65_600_000, liveUntilLedgerSeq: 66_000_000 });
      }
    }

    await route.fulfill({
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { entries, latestLedger: scenario.latestLedger ?? 65_635_400 } }),
    });
  });

  return stats;
}
