/**
 * Ledger keys for the batched reader, built with the Stellar SDK's own helpers
 * so they match what the SDK itself reads (LAZY-LOADED via batchLedgerEntries /
 * smolChainIdentity: imports the Stellar SDK, never import from a route
 * component). Pure: no RPC, no env, so it is unit-testable in Node.
 */
import './bufferGlobal.ts';
import { Address, Contract, nativeToScVal, xdr } from '@stellar/stellar-sdk/minimal';

/** Persistent contract-data key for `contractId` (same shape as the SDK's own reads). */
function persistentContractDataKey(contractId: string, key: xdr.ScVal): string {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    })
  ).toXDR('base64');
}

/**
 * SAC `Balance(holder)` entry. The ScVal is built exactly like
 * `rpc.Server.getSACBalance` builds it: `nativeToScVal(['Balance', holder],
 * { type: ['symbol', 'address'] })`.
 */
export function createSACBalanceLedgerKey(tokenContractId: string, holderAddress: string): string {
  return persistentContractDataKey(
    tokenContractId,
    nativeToScVal(['Balance', holderAddress], { type: ['symbol', 'address'] })
  );
}

/** Contract instance entry: the SDK's own `Contract#getFootprint()`. */
export function createContractInstanceLedgerKey(contractId: string): string {
  return new Contract(contractId).getFootprint().toXDR('base64');
}

/** Comet reserve map: persistent `["AllRecordData"]` → Map<address, record>. */
export function createCometRecordsLedgerKey(poolId: string): string {
  return persistentContractDataKey(poolId, nativeToScVal(['AllRecordData'], { type: ['symbol'] }));
}
