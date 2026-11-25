/**
 * Strict ledger-entry parsers (imports the Stellar SDK — lazy-load only).
 *
 * Every parser THROWS on anything it doesn't fully recognise. Callers map a
 * throw to `error` (unknown), never to a zero balance or an "unminted" song:
 * - SAC `amount` must be an i128 ≥ 0 (a u64 or a negative i128 is malformed).
 * - Comet record `balance` must be an i128 ≥ 0, `weight`/`scalar` i128 > 0.
 * - A Comet pool is only trusted when its executable is an audited hash.
 */
import { scValToNative, xdr } from '@stellar/stellar-sdk/minimal';
import type { CometFeeConfig, CometRecord } from './cometQuote.ts';

/**
 * Audited Comet executables (Report 31: deployed factory's Comet wasm,
 * SHA-256 recomputed from the on-chain contract-code entry). A new pool
 * executable requires a review before it is added here.
 */
export const SUPPORTED_COMET_WASM_HASHES: ReadonlySet<string> = new Set([
  '61e1fc5401a7b22418c2bd3bc5bd2c07241e4dae098c587c89f3f666aca12e37',
]);

function contractDataVal(entry: xdr.LedgerEntryData): xdr.ScVal {
  if (entry.switch().value !== xdr.LedgerEntryType.contractData().value) {
    throw new TypeError('Not a contract data entry');
  }
  return entry.contractData().val();
}

/** i128 ScVal → bigint; rejects every other type and (optionally) negatives / zero. */
export function strictI128(val: xdr.ScVal, opts: { min?: bigint } = {}): bigint {
  if (val.switch().value !== xdr.ScValType.scvI128().value) {
    throw new TypeError('Expected i128');
  }
  const value = scValToNative(val);
  if (typeof value !== 'bigint') throw new TypeError('Expected i128');
  if (opts.min !== undefined && value < opts.min) throw new RangeError('i128 below minimum');
  return value;
}

function symbolMap(val: xdr.ScVal): Map<string, xdr.ScVal> {
  if (val.switch().value !== xdr.ScValType.scvMap().value) throw new TypeError('Expected map');
  const out = new Map<string, xdr.ScVal>();
  for (const item of val.map() ?? []) {
    const key = item.key();
    if (key.switch().value !== xdr.ScValType.scvSymbol().value) throw new TypeError('Expected symbol key');
    out.set(key.sym().toString(), item.val());
  }
  return out;
}

/** SAC balance for a C-address holder: { amount: i128 ≥ 0, authorized, clawback }. */
export function parseBalanceFromLedgerEntry(entry: xdr.LedgerEntryData): bigint {
  const fields = symbolMap(contractDataVal(entry));
  const amount = fields.get('amount');
  if (!amount) throw new TypeError('SAC balance has no amount');
  return strictI128(amount, { min: 0n });
}

function instanceOf(entry: xdr.LedgerEntryData): xdr.ScContractInstance | null {
  const val = contractDataVal(entry);
  if (val.switch().value !== xdr.ScValType.scvContractInstance().value) return null;
  return val.instance();
}

/** True when the contract instance is a Stellar Asset Contract (built-in executable). */
export function isStellarAssetInstance(entry: xdr.LedgerEntryData): boolean {
  const instance = instanceOf(entry);
  return Boolean(
    instance &&
      instance.executable().switch().value ===
        xdr.ContractExecutableType.contractExecutableStellarAsset().value
  );
}

/** Hex wasm hash of a Wasm contract instance, or null (SAC / not an instance). */
export function contractWasmHash(entry: xdr.LedgerEntryData): string | null {
  const instance = instanceOf(entry);
  if (!instance) return null;
  const executable = instance.executable();
  if (executable.switch().value !== xdr.ContractExecutableType.contractExecutableWasm().value) return null;
  return Buffer.from(executable.wasmHash()).toString('hex');
}

export function isSupportedCometInstance(entry: xdr.LedgerEntryData): boolean {
  const wasmHash = contractWasmHash(entry);
  return wasmHash !== null && SUPPORTED_COMET_WASM_HASHES.has(wasmHash);
}

/** Comet `AllRecordData`: address → { balance ≥ 0, weight > 0, scalar > 0 }. */
export function parseCometRecords(entry: xdr.LedgerEntryData): Map<string, CometRecord> {
  const val = contractDataVal(entry);
  if (val.switch().value !== xdr.ScValType.scvMap().value) throw new TypeError('Records are not a map');
  const out = new Map<string, CometRecord>();
  for (const item of val.map() ?? []) {
    if (item.key().switch().value !== xdr.ScValType.scvAddress().value) {
      throw new TypeError('Record key is not an address');
    }
    const token = scValToNative(item.key());
    const fields = symbolMap(item.val());
    const balance = fields.get('balance');
    const weight = fields.get('weight');
    const scalar = fields.get('scalar');
    if (typeof token !== 'string' || !balance || !weight || !scalar) {
      throw new TypeError('Malformed Comet record');
    }
    out.set(token, {
      balance: strictI128(balance, { min: 0n }),
      weight: strictI128(weight, { min: 1n }),
      scalar: strictI128(scalar, { min: 1n }),
    });
  }
  return out;
}

/**
 * Comet instance storage `["SwapFeeConfig"]`. Returns null when absent or when
 * the pool executable isn't audited (local quoting is then unsupported).
 */
export function parseCometFeeConfig(
  entry: xdr.LedgerEntryData
): (CometFeeConfig & { trackedToken: string }) | null {
  const instance = instanceOf(entry);
  if (!instance || !isSupportedCometInstance(entry)) return null;
  for (const item of instance.storage() ?? []) {
    const key = item.key();
    if (key.switch().value !== xdr.ScValType.scvVec().value) continue;
    const parts = key.vec() ?? [];
    if (
      parts.length === 1 &&
      parts[0].switch().value === xdr.ScValType.scvSymbol().value &&
      parts[0].sym().toString() === 'SwapFeeConfig'
    ) {
      const fields = symbolMap(item.val());
      const tracked = fields.get('tracked_token');
      if (!tracked || tracked.switch().value !== xdr.ScValType.scvAddress().value) {
        throw new TypeError('Malformed SwapFeeConfig');
      }
      const need = (name: string) => {
        const v = fields.get(name);
        if (!v) throw new TypeError(`SwapFeeConfig missing ${name}`);
        return strictI128(v, { min: 0n });
      };
      return {
        trackedToken: scValToNative(tracked) as string,
        minFee: need('min_fee'),
        maxFee: need('max_fee'),
        lowUtilBalance: need('low_util_balance'),
        highUtilBalance: need('high_util_balance'),
      };
    }
  }
  return null;
}
