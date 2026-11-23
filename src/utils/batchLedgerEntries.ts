import { Address, xdr } from '@stellar/stellar-sdk/minimal';
import { rpc } from './base';
import { logger } from './logger';

export interface BalanceBatchRequest {
  tokenContractId: string;
  holderAddress: string;
  id?: string;
}

export interface BalanceBatchResult {
  tokenContractId: string;
  holderAddress: string;
  balance: bigint;
  id?: string;
  error?: string;
}

export function createSACBalanceLedgerKey(
  tokenContractId: string,
  holderAddress: string
): string {
  const balanceKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Balance'),
    new Address(holderAddress).toScVal(),
  ]);

  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(tokenContractId).toScAddress(),
      key: balanceKey,
      durability: xdr.ContractDataDurability.persistent(),
    })
  );

  return ledgerKey.toXDR('base64');
}

export function parseBalanceFromLedgerEntry(entryData: xdr.LedgerEntryData): bigint {
  try {
    if (entryData.switch().value !== xdr.LedgerEntryType.contractData().value) {
      throw new Error('Not a contract data entry');
    }

    const contractData = entryData.contractData();
    const val = contractData.val();

    if (val.switch().value === xdr.ScValType.scvMap().value) {
      const mapEntries = val.map() || [];

      for (const mapEntry of mapEntries) {
        const key = mapEntry.key();
        if (
          key.switch().value === xdr.ScValType.scvSymbol().value &&
          key.sym().toString() === 'amount'
        ) {
          const amountVal = mapEntry.val();
          if (amountVal.switch().value === xdr.ScValType.scvI128().value) {
            const i128 = amountVal.i128();
            const lo = i128.lo();
            const hi = i128.hi();
            return (BigInt(hi.toString()) << 64n) | BigInt(lo.toString());
          }
        }
      }
    }

    return 0n;
  } catch (error) {
    logger.error('balance', 'Error parsing balance from ledger entry:', error);
    return 0n;
  }
}

const inflightRequests = new Map<string, Promise<BalanceBatchResult[]>>();

function createBatchCacheKey(requests: BalanceBatchRequest[]): string {
  return requests
    .map((req) => `${req.tokenContractId}:${req.holderAddress}`)
    .sort()
    .join('|');
}

export async function getBatchSACBalances(
  requests: BalanceBatchRequest[]
): Promise<BalanceBatchResult[]> {
  if (requests.length === 0) {
    return [];
  }

  const MAX_BATCH_SIZE = 200;

  if (requests.length > MAX_BATCH_SIZE) {
    const chunks: BalanceBatchRequest[][] = [];
    for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
      chunks.push(requests.slice(i, i + MAX_BATCH_SIZE));
    }
    const chunkResults = await Promise.all(chunks.map((chunk) => getBatchSACBalances(chunk)));
    return chunkResults.flat();
  }

  const cacheKey = createBatchCacheKey(requests);
  const existing = inflightRequests.get(cacheKey);
  if (existing) {
    logger.info('balance', 'Deduplicating batch balance request');
    return existing;
  }

  const keys = requests.map((req) =>
    createSACBalanceLedgerKey(req.tokenContractId, req.holderAddress)
  );

  const requestPromise = (async () => {
    try {
      const ledgerKeys = keys.map((key) => xdr.LedgerKey.fromXDR(key, 'base64'));
      const response = await rpc.getLedgerEntries(...ledgerKeys);

      // Soroban RPC omits missing ledger entries; index returned entries by XDR key
      // instead of relying on positional indices.
      const entriesByKey = new Map<string, (typeof response.entries)[number]>();
      for (const entry of response.entries ?? []) {
        if (!entry?.key) continue;
        const keyBase64 = typeof entry.key === 'string'
          ? entry.key
          : entry.key.toXDR('base64');
        entriesByKey.set(keyBase64, entry);
      }

      const results: BalanceBatchResult[] = requests.map((req, index) => {
        const entry = entriesByKey.get(keys[index]);

        if (!entry || !entry.val) {
          return {
            tokenContractId: req.tokenContractId,
            holderAddress: req.holderAddress,
            balance: 0n,
            id: req.id,
            error: 'Entry not found',
          };
        }

        const balance = parseBalanceFromLedgerEntry(entry.val);

        return {
          tokenContractId: req.tokenContractId,
          holderAddress: req.holderAddress,
          balance,
          id: req.id,
        };
      });

      return results;
    } catch (error) {
      logger.error('balance', 'Error fetching batch balances:', error);

      return requests.map((req) => ({
        tokenContractId: req.tokenContractId,
        holderAddress: req.holderAddress,
        balance: 0n,
        id: req.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, requestPromise);

  return requestPromise;
}
