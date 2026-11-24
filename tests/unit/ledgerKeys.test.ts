import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Address, Contract, StrKey, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk/minimal';
import {
  createCometRecordsLedgerKey,
  createContractInstanceLedgerKey,
  createSACBalanceLedgerKey,
} from '../../src/utils/ledgerKeys.ts';

const C = (seed: string) => StrKey.encodeContract(hash(Buffer.from(seed)));
const G = (seed: string) => StrKey.encodeEd25519PublicKey(hash(Buffer.from(seed)));
const KALE_SAC = C('kale');
const POOL = C('pool');
const HOLDER_C = C('smart-wallet');
const HOLDER_G = G('classic-account');

/** The hand-rolled shape these helpers replaced (byte-for-byte reference). */
function manualContractData(contractId: string, key: xdr.ScVal): string {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    })
  ).toXDR('base64');
}

test('contract instance key: Contract#getFootprint() is byte-identical to the manual LedgerKeyContractData', () => {
  for (const id of [KALE_SAC, POOL]) {
    const key = createContractInstanceLedgerKey(id);
    assert.equal(key, manualContractData(id, xdr.ScVal.scvLedgerKeyContractInstance()));
    assert.equal(key, new Contract(id).getFootprint().toXDR('base64'));
  }
});

test('SAC balance key: matches the manual vec and rpc.Server.getSACBalance (nativeToScVal symbol+address)', () => {
  for (const holder of [HOLDER_C, HOLDER_G]) {
    const key = createSACBalanceLedgerKey(KALE_SAC, holder);
    const manual = manualContractData(
      KALE_SAC,
      xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), new Address(holder).toScVal()])
    );
    const sdk = manualContractData(KALE_SAC, nativeToScVal(['Balance', holder], { type: ['symbol', 'address'] }));
    assert.equal(key, manual);
    assert.equal(key, sdk);
    const decoded = xdr.LedgerKey.fromXDR(key, 'base64').contractData();
    assert.equal(decoded.durability().name, 'persistent');
    assert.equal(Address.fromScAddress(decoded.contract()).toString(), KALE_SAC);
  }
});

test('Comet records key: nativeToScVal([AllRecordData]) matches the manual symbol vec', () => {
  const key = createCometRecordsLedgerKey(POOL);
  assert.equal(key, manualContractData(POOL, xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('AllRecordData')])));
});

test('key builders reject invalid addresses (callers map this to an error, never 0)', () => {
  assert.throws(() => createSACBalanceLedgerKey(KALE_SAC, 'not-an-address'));
  assert.throws(() => createContractInstanceLedgerKey('CBAD'));
});
