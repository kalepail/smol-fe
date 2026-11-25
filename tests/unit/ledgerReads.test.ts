import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Address, StrKey, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk/minimal';
import {
  SUPPORTED_COMET_WASM_HASHES,
  isSupportedCometInstance,
  parseBalanceFromLedgerEntry,
  parseCometFeeConfig,
  parseCometRecords,
} from '../../src/utils/ledgerParsers.ts';
import {
  createArchiveCapability,
  interpretIdentity,
  interpretLedgerResponse,
  knownBalance,
  toBalanceResult,
  type LedgerEntryRead,
  type SmolIdentity,
} from '../../src/utils/ledgerReads.ts';

const C = (seed: string) => StrKey.encodeContract(hash(Buffer.from(seed)));
const KALE = C('kale');
const SAC = C('sac');
const POOL = C('pool');
const OTHER = C('other-song-sac');
const AUDITED = [...SUPPORTED_COMET_WASM_HASHES][0];
const identity: SmolIdentity = { id: 'ab', padded: 'ab'.padStart(64, '0'), assetCode: '000000000000', sac: SAC, pool: POOL };
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const entry = (key: xdr.ScVal, val: xdr.ScVal) => new xdr.ScMapEntry({ key, val });

function data(contract: string, val: xdr.ScVal): xdr.LedgerEntryData {
  return xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: xdr.ExtensionPoint.fromXDR(Buffer.alloc(4)),
      contract: new Address(contract).toScAddress(),
      key: sym('k'),
      durability: xdr.ContractDataDurability.persistent(),
      val,
    })
  );
}
const balanceEntry = (amount: xdr.ScVal) =>
  data(SAC, xdr.ScVal.scvMap([entry(sym('amount'), amount), entry(sym('authorized'), xdr.ScVal.scvBool(true))]));
const record = (balance: bigint) =>
  xdr.ScVal.scvMap([
    entry(sym('balance'), nativeToScVal(balance, { type: 'i128' })),
    entry(sym('scalar'), nativeToScVal(10n ** 11n, { type: 'i128' })),
    entry(sym('weight'), nativeToScVal(5_000_000n, { type: 'i128' })),
  ]);
const records = (tokens: string[], kaleBalance = 1_000_000_000n) =>
  data(POOL, xdr.ScVal.scvMap(tokens.map((t) => entry(new Address(t).toScVal(), record(t === KALE ? kaleBalance : 10n ** 15n)))));
const wasmInstance = (hashHex: string, storage: xdr.ScMapEntry[] | null = null) =>
  data(
    POOL,
    xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(hashHex, 'hex')), storage })
    )
  );
const sacInstance = data(
  SAC,
  xdr.ScVal.scvContractInstance(
    new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableStellarAsset(), storage: null })
  )
);
const found = (val: xdr.LedgerEntryData): LedgerEntryRead => ({ state: 'found', val, archived: false, latestLedger: 100 });
const missing = (archiveAware: boolean): LedgerEntryRead => ({ state: 'missing', latestLedger: 100, archiveAware });
const opts = { kaleSac: KALE, requireAuditedPool: true };

test('#5 SAC amount must be a non-negative i128 (u64 / negative are malformed, never 0)', () => {
  assert.equal(parseBalanceFromLedgerEntry(balanceEntry(nativeToScVal(5n, { type: 'i128' }))), 5n);
  assert.throws(() => parseBalanceFromLedgerEntry(balanceEntry(nativeToScVal(0n, { type: 'u64' }))));
  assert.throws(() => parseBalanceFromLedgerEntry(balanceEntry(nativeToScVal(-1n, { type: 'i128' }))));
  const u64 = toBalanceResult({ tokenContractId: SAC, holderAddress: KALE }, found(balanceEntry(nativeToScVal(0n, { type: 'u64' }))));
  assert.equal(u64.status, 'error');
  assert.equal(knownBalance(u64), null);
});

test('#5 an omission is a known zero only on an archive-aware reader', () => {
  const req = { tokenContractId: SAC, holderAddress: KALE };
  assert.equal(knownBalance(toBalanceResult(req, missing(true))), 0n);
  assert.equal(knownBalance(toBalanceResult(req, missing(false))), null);
  assert.equal(knownBalance(toBalanceResult(req, { state: 'error', error: 'x' })), null);
});

test('#5 Comet records reject negative balances and non-positive weight/scalar', () => {
  assert.throws(() => parseCometRecords(records([KALE, SAC], -1n)));
  assert.equal(parseCometRecords(records([KALE, SAC])).get(KALE)!.balance, 1_000_000_000n);
});

test('#8 only the audited Comet executable is trusted; fee config is gated on it', () => {
  const feeStorage = [
    entry(
      xdr.ScVal.scvVec([sym('SwapFeeConfig')]),
      xdr.ScVal.scvMap([
        entry(sym('high_util_balance'), nativeToScVal(700_000_000_000n, { type: 'i128' })),
        entry(sym('low_util_balance'), nativeToScVal(1_000_000_000n, { type: 'i128' })),
        entry(sym('max_fee'), nativeToScVal(9_500_000n, { type: 'i128' })),
        entry(sym('min_fee'), nativeToScVal(500_000n, { type: 'i128' })),
        entry(sym('tracked_token'), new Address(KALE).toScVal()),
      ])
    ),
  ];
  assert.equal(isSupportedCometInstance(wasmInstance(AUDITED)), true);
  assert.equal(isSupportedCometInstance(wasmInstance('00'.repeat(32))), false);
  assert.equal(parseCometFeeConfig(wasmInstance(AUDITED, feeStorage))?.maxFee, 9_500_000n);
  assert.equal(parseCometFeeConfig(wasmInstance('00'.repeat(32), feeStorage)), null);
});

test('identity verdict: verified mint, unaudited pool, cross-bound pool', () => {
  const ok = interpretIdentity(identity, { sacInstance: found(sacInstance), poolInstance: found(wasmInstance(AUDITED)), poolRecords: found(records([KALE, SAC])) }, opts);
  assert.equal(ok.facts.status, 'minted');
  const unaudited = interpretIdentity(identity, { sacInstance: found(sacInstance), poolInstance: found(wasmInstance('11'.repeat(32))), poolRecords: found(records([KALE, SAC])) }, opts);
  assert.equal(unaudited.facts.status, 'unresolved', '#8 unaudited executable never becomes a buyable identity');
  const tradeView = interpretIdentity(identity, { sacInstance: found(sacInstance), poolInstance: found(wasmInstance('11'.repeat(32))), poolRecords: found(records([KALE, SAC])) }, { ...opts, requireAuditedPool: false });
  assert.equal(tradeView.facts.status, 'minted');
  assert.equal(tradeView.auditedPool, false, 'trade view: local quotes unsupported');
  const crossBound = interpretIdentity(identity, { sacInstance: found(sacInstance), poolInstance: found(wasmInstance(AUDITED)), poolRecords: found(records([KALE, OTHER])) }, opts);
  assert.equal(crossBound.facts.status, 'unresolved');
});

test('#5 absent pool means unminted ONLY on an archive-aware reader', () => {
  const aware = interpretIdentity(identity, { sacInstance: missing(true), poolInstance: missing(true), poolRecords: missing(true) }, opts);
  assert.equal(aware.facts.status, 'unminted');
  const blind = interpretIdentity(identity, { sacInstance: missing(false), poolInstance: missing(false), poolRecords: missing(false) }, opts);
  assert.equal(blind.facts.status, 'error', 'archive-blind / unverified reader: unknown, never "unminted"');
  const failed = interpretIdentity(identity, { sacInstance: { state: 'error', error: 'x' }, poolInstance: missing(true), poolRecords: missing(true) }, opts);
  assert.equal(failed.facts.status, 'error');
});

test('#3 archive capability needs POSITIVE evidence (TTL 0), never an absent TTL field', async () => {
  const cap = createArchiveCapability({ probe: () => Promise.reject(new Error('getVersionInfo unavailable')) });
  const req = { tokenContractId: SAC, holderAddress: KALE };
  const omitted = async () => knownBalance(toBalanceResult(req, missing(await cap.isAware())));
  assert.equal(await omitted(), null, 'unverified reader: omitted balance is unknown');
  cap.observe(undefined); // a live entry whose optional TTL field is absent
  assert.equal(await omitted(), null, 'still unknown: an absent TTL is not archive evidence');
  cap.observe(66_000_000); // a normal live TTL
  assert.equal(await omitted(), null);
  cap.observe(0); // explicit archived TTL placeholder
  assert.equal(await omitted(), 0n, 'positive evidence: omission now means absent');

  const probed = createArchiveCapability({ probe: async () => true });
  assert.equal(await probed.isAware(), true);
  assert.equal(await createArchiveCapability({ override: '0', probe: async () => true }).isAware(), false);
});

test('#4 a malformed getLedgerEntries success (result: {}) is an error, never missing / 0n', () => {
  const keys = ['k1', 'k2'];
  const none = () => [];
  for (const bad of [{}, null, { latestLedger: 0, entries: [] }, { latestLedger: 1.5, entries: [] }, { latestLedger: '100', entries: [] }, { latestLedger: 100 }]) {
    const reads = interpretLedgerResponse(keys, bad as never, none, true);
    for (const key of keys) assert.equal(reads.get(key)!.state, 'error', JSON.stringify(bad));
    const balance = toBalanceResult({ tokenContractId: SAC, holderAddress: KALE }, reads.get('k1'));
    assert.equal(knownBalance(balance), null);
  }
  const ok = interpretLedgerResponse(keys, { latestLedger: 100, entries: [] }, none, true);
  assert.equal(ok.get('k1')!.state, 'missing', 'a well-formed response may report absence');
});
