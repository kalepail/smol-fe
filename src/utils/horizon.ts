/**
 * Unified Horizon API utilities for querying Stellar network data
 *
 * This module provides:
 * - Account existence checks
 * - Operations queries with pagination
 * - XDR parsing for contract invocations
 * - Request deduplication
 * - Proper error handling
 */

import { xdr, StrKey, scValToNative } from '@stellar/stellar-sdk';
import logger, { LogCategory, createScopedLogger } from './debug-logger';

const HORIZON_URL = 'https://horizon.stellar.org';
const log = createScopedLogger(LogCategory.HORIZON);

/**
 * In-flight request tracker to prevent duplicate parallel requests
 */
const inflightRequests = new Map<string, Promise<any>>();

/**
 * Result cache with TTL (5 minutes default)
 */
interface CachedResult<T> {
    result: T;
    timestamp: number;
    ttl: number;
}
const resultCache = new Map<string, CachedResult<any>>();

function getCached<T>(key: string): T | null {
    const cached = resultCache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
        resultCache.delete(key);
        return null;
    }

    log.trace('Using cached result', { key, ageMs: age });
    return cached.result as T;
}

function setCache<T>(key: string, result: T, ttlMs: number = 300000) {
    resultCache.set(key, { result, timestamp: Date.now(), ttl: ttlMs });
}

/**
 * Transfer operation parsed from XDR
 */
export interface ParsedTransfer {
    from: string;
    to: string;
    amount: number; // Converted to decimal (divided by 10^7)
    contractAddress: string;
    functionName: string;
}

/**
 * Result of operations scan
 */
export interface OperationsScanResult {
    transfers: ParsedTransfer[];
    operationsScanned: number;
    hasMore: boolean;
}

/**
 * Check if an account/contract exists on the Stellar network
 *
 * @param address - Stellar address (G... or C...)
 * @returns true if account exists, false otherwise
 */
export async function accountExists(address: string): Promise<boolean> {
    log.trace('accountExists() called', { address });

    // Validate address format first
    const trimmed = address.trim();
    if (!trimmed) {
        log.warn('accountExists: Empty address provided');
        return false;
    }

    // Accept both account (G) and contract (C) addresses
    const isValid = StrKey.isValidEd25519PublicKey(trimmed) || StrKey.isValidContract(trimmed);
    if (!isValid) {
        log.warn('accountExists: Invalid address format', { address: trimmed });
        return false;
    }

    const cacheKey = `account:${trimmed}`;

    // Deduplicate parallel requests
    if (inflightRequests.has(cacheKey)) {
        log.trace('accountExists: Using deduplicated request', { address: trimmed });
        return inflightRequests.get(cacheKey)!;
    }

    log.debug('accountExists: Starting account check', { address: trimmed });
    log.startTimer(`accountExists:${trimmed}`);

    const request = (async () => {
        try {
            const url = `${HORIZON_URL}/accounts/${trimmed}`;
            log.trace('accountExists: Fetching', { url });

            const response = await fetch(url);
            const exists = response.ok;

            log.endTimer(`accountExists:${trimmed}`);

            if (exists) {
                log.debug('accountExists: Account found', { address: trimmed });
            } else {
                // Distinguish between 404 (not found) and 400 (bad request/invalid address)
                if (response.status === 404) {
                    log.info('accountExists: Account not found (404)', {
                        address: trimmed,
                        status: response.status,
                        statusText: response.statusText
                    });
                } else if (response.status === 400) {
                    log.warn('accountExists: Invalid account address (400 Bad Request)', {
                        address: trimmed,
                        status: response.status,
                        statusText: response.statusText,
                        hint: 'The address format may be invalid or malformed'
                    });
                } else {
                    log.warn('accountExists: Unexpected response', {
                        address: trimmed,
                        status: response.status,
                        statusText: response.statusText
                    });
                }
            }

            return exists;
        } catch (error) {
            log.endTimer(`accountExists:${trimmed}`);
            log.error('accountExists: Network error', { address: trimmed }, error as Error);
            return false;
        } finally {
            inflightRequests.delete(cacheKey);
        }
    })();

    inflightRequests.set(cacheKey, request);
    return request;
}

/**
 * Scan operations for an account, parsing transfer operations from XDR
 *
 * @param address - Stellar address to scan
 * @param options - Query options
 * @returns Parsed transfers and scan metadata
 */
export async function scanAccountOperations(
    address: string,
    options: {
        limit?: number;
        includeFailedTransactions?: boolean;
        maxPages?: number;
        stopAtTransfer?: (transfer: ParsedTransfer) => boolean;
    } = {}
): Promise<OperationsScanResult> {
    const {
        limit = 200,
        includeFailedTransactions = false,
        maxPages = 1,
        stopAtTransfer
    } = options;

    log.trace('scanAccountOperations() called', { address, options });

    // Validate address
    const trimmed = address.trim();
    if (!trimmed || !StrKey.isValidContract(trimmed)) {
        log.warn('scanAccountOperations: Invalid contract address', { address });
        return { transfers: [], operationsScanned: 0, hasMore: false };
    }

    // Check if account exists first
    log.debug('scanAccountOperations: Checking account existence', { address: trimmed });
    const exists = await accountExists(trimmed);
    if (!exists) {
        log.info('scanAccountOperations: Account not found, returning empty', { address: trimmed });
        return { transfers: [], operationsScanned: 0, hasMore: false };
    }

    const cacheKey = `operations:${trimmed}:${limit}:${includeFailedTransactions}`;

    // Deduplicate parallel requests
    if (inflightRequests.has(cacheKey)) {
        log.trace('scanAccountOperations: Using deduplicated request', { address: trimmed });
        return inflightRequests.get(cacheKey)!;
    }

    log.debug('scanAccountOperations: Starting operations scan', {
        address: trimmed,
        limit,
        maxPages,
        includeFailedTransactions
    });
    log.startTimer(`scanOps:${trimmed}`);

    const request = (async () => {
        try {
            const transfers: ParsedTransfer[] = [];
            let operationsScanned = 0;
            let currentUrl = `${HORIZON_URL}/accounts/${trimmed}/operations?limit=${limit}&order=desc&include_failed=${includeFailedTransactions}`;
            let pagesScanned = 0;
            let shouldStop = false;

            while (currentUrl && pagesScanned < maxPages && !shouldStop) {
                log.trace('scanAccountOperations: Fetching page', {
                    pageNumber: pagesScanned + 1,
                    url: currentUrl
                });

                const response = await fetch(currentUrl);

                if (!response.ok) {
                    log.warn('scanAccountOperations: Operations query failed', {
                        status: response.status,
                        statusText: response.statusText,
                        pageNumber: pagesScanned + 1
                    });
                    break;
                }

                const data = await response.json();
                const operations = data._embedded?.records || [];
                operationsScanned += operations.length;

                log.debug('scanAccountOperations: Page fetched', {
                    pageNumber: pagesScanned + 1,
                    operationsInPage: operations.length,
                    totalScanned: operationsScanned
                });

                for (const op of operations) {
                    // Only process Soroban contract invocations
                    if (op.type !== 'invoke_host_function') continue;

                    const parsed = parseTransferOperation(op);
                    if (parsed) {
                        transfers.push(parsed);
                        log.trace('scanAccountOperations: Transfer found', {
                            from: parsed.from,
                            to: parsed.to,
                            amount: parsed.amount,
                            contract: parsed.contractAddress
                        });

                        // Check if caller wants to stop early
                        if (stopAtTransfer && stopAtTransfer(parsed)) {
                            log.debug('scanAccountOperations: Early stop triggered', {
                                transfersFound: transfers.length,
                                operationsScanned
                            });
                            shouldStop = true;
                            break;
                        }
                    }
                }

                // Get next page URL
                currentUrl = data._links?.next?.href || null;
                pagesScanned++;
            }

            const duration = log.endTimer(`scanOps:${trimmed}`);

            log.info('scanAccountOperations: Scan complete', {
                address: trimmed,
                transfersFound: transfers.length,
                operationsScanned,
                pagesScanned,
                hasMore: !!currentUrl && pagesScanned >= maxPages,
                durationMs: duration
            });

            return {
                transfers,
                operationsScanned,
                hasMore: !!currentUrl && pagesScanned >= maxPages
            };
        } catch (error) {
            log.endTimer(`scanOps:${trimmed}`);
            log.error('scanAccountOperations: Scan failed', { address: trimmed }, error as Error);
            return { transfers: [], operationsScanned: 0, hasMore: false };
        } finally {
            inflightRequests.delete(cacheKey);
        }
    })();

    inflightRequests.set(cacheKey, request);
    return request;
}

/**
 * Parse a transfer operation from Horizon operation object
 *
 * @param op - Horizon operation object
 * @returns Parsed transfer or null if not a transfer
 */
function parseTransferOperation(op: any): ParsedTransfer | null {
    try {
        // Parse the host function XDR
        if (!op.function) return null;

        const buffer = Buffer.from(op.function, 'base64');
        const hostFn = xdr.HostFunction.fromXDR(buffer);

        // We expect InvokeContract
        if (hostFn.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
            return null;
        }

        const args = hostFn.invokeContract();
        const contractAddress = StrKey.encodeContract(args.contractAddress().contractId() as any);
        const functionName = args.functionName().toString();

        // Only interested in 'transfer' function
        if (functionName !== 'transfer') return null;

        const valArgs = args.args();

        // transfer(from, to, amount)
        if (valArgs.length !== 3) {
            log.trace('parseTransferOperation: Invalid transfer args length', {
                length: valArgs.length,
                contract: contractAddress
            });
            return null;
        }

        const fromVal = valArgs[0];
        const toVal = valArgs[1];
        const amountVal = valArgs[2];

        const from = scValToNative(fromVal);
        const to = scValToNative(toVal);
        const amountRaw = scValToNative(amountVal);

        // Convert amount from token units (7 decimals) to decimal
        const amount = Number(amountRaw) / 10000000;

        log.trace('parseTransferOperation: Transfer parsed', {
            from,
            to,
            amount,
            contractAddress,
            functionName
        });

        return {
            from,
            to,
            amount,
            contractAddress,
            functionName
        };
    } catch (error) {
        // Silently ignore parse errors - not all operations will be parseable
        log.trace('parseTransferOperation: Parse failed (expected for non-transfer ops)', {
            error: (error as Error).message
        });
        return null;
    }
}

/**
 * Find transfers to a specific recipient with specific amounts
 *
 * This is a convenience method for finding specific payment patterns,
 * useful for verifying purchases or upgrades.
 *
 * @param address - Address to scan
 * @param recipient - Expected recipient address
 * @param amounts - Expected payment amounts (will match with 0.1 tolerance)
 * @param options - Additional options
 * @returns Map of amount to whether it was found
 */
export async function findTransfersToRecipient(
    address: string,
    recipient: string,
    amounts: number[],
    options: {
        limit?: number;
        maxPages?: number;
        contractAddress?: string; // Optional: filter by specific token contract
        caller?: string; // Optional: identify caller for debugging
        noCache?: boolean; // Optional: bypass cache
    } = {}
): Promise<Map<number, boolean>> {
    const callStack = new Error().stack?.split('\n')[2]?.trim() || 'unknown';
    log.debug('findTransfersToRecipient() called', {
        address,
        recipient,
        amounts,
        options,
        caller: options.caller || callStack
    });

    // Check cache first (unless noCache option is set)
    const cacheKey = `transfers:${address}:${recipient}:${amounts.sort().join(',')}`;
    if (!options.noCache) {
        const cached = getCached<Map<number, boolean>>(cacheKey);
        if (cached) {
            log.debug('findTransfersToRecipient: Using cached result', { address, recipient });
            return cached;
        }
    }

    log.startTimer(`findTransfers:${address}`);

    const result = new Map<number, boolean>();
    amounts.forEach(amount => result.set(amount, false));

    const amountsRemaining = new Set(amounts);
    let matchedCount = 0;

    const scanResult = await scanAccountOperations(address, {
        ...options,
        stopAtTransfer: (transfer) => {
            // Check if this transfer matches our criteria
            if (transfer.to !== recipient) {
                log.trace('findTransfersToRecipient: Transfer recipient mismatch', {
                    expected: recipient,
                    actual: transfer.to
                });
                return false;
            }

            // If contractAddress specified, must match
            if (options.contractAddress && transfer.contractAddress !== options.contractAddress) {
                log.trace('findTransfersToRecipient: Contract address mismatch', {
                    expected: options.contractAddress,
                    actual: transfer.contractAddress
                });
                return false;
            }

            // Check if amount matches any of our target amounts (with tolerance)
            for (const targetAmount of amountsRemaining) {
                if (Math.abs(transfer.amount - targetAmount) < 0.1) {
                    result.set(targetAmount, true);
                    amountsRemaining.delete(targetAmount);
                    matchedCount++;

                    log.debug('findTransfersToRecipient: Amount matched', {
                        targetAmount,
                        actualAmount: transfer.amount,
                        matchedSoFar: matchedCount,
                        remaining: amountsRemaining.size
                    });

                    // Stop if we found all amounts
                    if (amountsRemaining.size === 0) {
                        log.info('findTransfersToRecipient: All amounts found, stopping early');
                        return true;
                    }
                    return false;
                }
            }

            return false;
        }
    });

    const duration = log.endTimer(`findTransfers:${address}`);

    log.info('findTransfersToRecipient: Search complete', {
        address,
        recipient,
        totalAmounts: amounts.length,
        foundAmounts: matchedCount,
        operationsScanned: scanResult.operationsScanned,
        durationMs: duration,
        results: Object.fromEntries(result)
    });

    // Cache the result for 5 minutes
    if (!options.noCache) {
        setCache(cacheKey, result, 300000);
    }

    return result;
}

/**
 * Clear in-flight request cache
 * Useful for testing or forcing fresh requests
 */
export function clearRequestCache(): void {
    const count = inflightRequests.size;
    inflightRequests.clear();
    log.info('clearRequestCache: Cache cleared', { requestsCleared: count });
}
