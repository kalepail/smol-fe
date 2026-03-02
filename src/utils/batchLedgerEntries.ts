import { Address, xdr } from '@stellar/stellar-sdk/minimal';
import { getRpcServer } from './base';

/**
 * Represents a batch request for SAC token balances
 */
export interface BalanceBatchRequest {
  /** The contract ID of the SAC token */
  tokenContractId: string;
  /** The address to check the balance for */
  holderAddress: string;
  /** Optional identifier to track this request */
  id?: string;
}

/**
 * Result of a batch balance request
 */
export interface BalanceBatchResult {
  /** The contract ID of the SAC token */
  tokenContractId: string;
  /** The address that holds the balance */
  holderAddress: string;
  /** The balance amount in stroops (7 decimals) */
  balance: bigint;
  /** Optional identifier from the request */
  id?: string;
  /** Error if the balance could not be retrieved */
  error?: string;
}

/**
 * Creates a ledger key for a SAC token balance
 *
 * SAC balances are stored as contract data with:
 * - Key: Balance(Address) - an enum variant with the holder's address
 * - Durability: Persistent
 *
 * @param tokenContractId - The contract ID of the SAC token
 * @param holderAddress - The address to get the balance for
 * @returns Base64-encoded ledger key
 */
export function createSACBalanceLedgerKey(
  tokenContractId: string,
  holderAddress: string
): string {
  // Create the Balance(Address) key
  // This is a Vec with: [Symbol("Balance"), Address(holderAddress)]
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

/**
 * Parses a balance value from ledger entry data
 *
 * The balance is stored as a BalanceValue struct:
 * { amount: i128, authorized: bool, clawback: bool }
 *
 * @param entryData - LedgerEntryData XDR object
 * @returns The balance amount in stroops
 */
export function parseBalanceFromLedgerEntry(entryData: xdr.LedgerEntryData): bigint {
  try {
    // Navigate to the contract data
    if (entryData.switch().value !== xdr.LedgerEntryType.contractData().value) {
      throw new Error('Not a contract data entry');
    }

    const contractData = entryData.contractData();
    const val = contractData.val();

    // The value should be a Map with "amount", "authorized", "clawback" fields
    // We only need the "amount" field
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

            // Combine hi and lo parts into a bigint
            // hi is the upper 64 bits, lo is the lower 64 bits
            return (BigInt(hi.toString()) << 64n) | BigInt(lo.toString());
          }
        }
      }
    }

    return 0n;
  } catch (error) {
    console.error('Error parsing balance from ledger entry:', error);
    return 0n;
  }
}

// Request deduplication cache
const inflightRequests = new Map<string, Promise<BalanceBatchResult[]>>();

/**
 * Creates a cache key for deduplicating batch balance requests
 */
function createBatchCacheKey(requests: BalanceBatchRequest[]): string {
  return requests
    .map((req) => `${req.tokenContractId}:${req.holderAddress}`)
    .sort()
    .join('|');
}

/**
 * Batch retrieves SAC token balances using a single RPC call
 *
 * This is much more efficient than making individual balance calls,
 * especially when checking balances for many tokens.
 *
 * Maximum batch size is 200 keys per RPC call.
 *
 * Includes request deduplication to prevent duplicate fetches.
 *
 * @param requests - Array of balance requests
 * @returns Array of balance results
 */
export async function getBatchSACBalances(
  requests: BalanceBatchRequest[]
): Promise<BalanceBatchResult[]> {
  if (requests.length === 0) {
    return [];
  }

  const MAX_BATCH_SIZE = 200;

  // If we have more than 200 requests, we need to batch them
  if (requests.length > MAX_BATCH_SIZE) {
    const results: BalanceBatchResult[] = [];

    for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
      const batch = requests.slice(i, i + MAX_BATCH_SIZE);
      const batchResults = await getBatchSACBalances(batch);
      results.push(...batchResults);
    }

    return results;
  }

  // Check if this exact request is already in-flight
  const cacheKey = createBatchCacheKey(requests);
  const existing = inflightRequests.get(cacheKey);
  if (existing) {
    // console.log('Deduplicating batch balance request');
    return existing;
  }

  // Create ledger keys for all requests
  const keys = requests.map((req) =>
    createSACBalanceLedgerKey(req.tokenContractId, req.holderAddress)
  );

  // Create the promise for this request
  const requestPromise = (async () => {
    try {
      // Create XDR LedgerKey objects from the base64 strings
      const ledgerKeys = keys.map((key) => xdr.LedgerKey.fromXDR(key, 'base64'));

      // Make a single RPC call to get all ledger entries
      const server = getRpcServer();
      const response = await server.getLedgerEntries(...ledgerKeys);

      // Map results back to the requests
      const results: BalanceBatchResult[] = requests.map((req, index) => {
        const entry = response.entries?.[index];

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
      console.error('Error fetching batch balances:', error);

      // Return error results for all requests
      return requests.map((req) => ({
        tokenContractId: req.tokenContractId,
        holderAddress: req.holderAddress,
        balance: 0n,
        id: req.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    } finally {
      // Clean up the cache after request completes
      inflightRequests.delete(cacheKey);
    }
  })();

  // Store in cache
  inflightRequests.set(cacheKey, requestPromise);

  return requestPromise;
}
