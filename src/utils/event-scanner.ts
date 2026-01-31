import { xdr, Address, contract } from '@stellar/stellar-sdk/minimal';
const { scValToNative } = contract;
import { getBestRpcUrl } from './rpc';
import logger, { LogCategory } from './debug-logger';

const RPC_METHOD = 'getEvents';

interface GetEventsRequest {
    startLedger?: number;
    filters: {
        type: 'contract';
        contractIds: string[];
        topics: string[][];
    }[];
    pagination?: {
        limit: number;
    };
}

interface EventResponse {
    events: {
        type: string;
        ledger: number;
        ledgerClosedAt: string;
        contractId: string;
        id: string;
        pagingToken: string;
        topic: string[];
        value: string; // xdr base64
        inSuccessfulContractCall: boolean;
    }[];
    latestLedger: number;
}

/**
 * Parsed token transfer event
 */
export interface TokenTransfer {
    from: string;
    to: string;
    amount: number;
    contractId: string;
    ledger: number;
    timestamp: Date;
}

/**
 * Find token transfers between specific addresses using RPC Events
 * This works for both Smart Accounts (Contracts) and standard Accounts
 *
 * @param fromAddress - Sender address
 * @param toAddress - Recipient address (Admin)
 * @param tokenContractId - The token contract address (e.g., KALE)
 * @param options - Query options
 */
// Cache the last known valid start ledger to avoid repetitive "range" errors
let cachedSafeStartLedger = 0;

export async function findTokenTransfers(
    fromAddress: string,
    toAddress: string,
    tokenContractId: string,
    options: {
        limit?: number;
        startLedger?: number;
    } = {}
): Promise<TokenTransfer[]> {
    const log = logger;
    const { limit = 100, startLedger } = options;

    log.debug(LogCategory.RPC, 'findTokenTransfers called', { fromAddress, toAddress, tokenContractId });

    try {
        // Encode topics for filtering: ['transfer', from, to]
        // This is the standard Soroban Token Interface event structure
        const topic0 = xdr.ScVal.scvSymbol('transfer').toXDR('base64');
        const topic1 = new Address(fromAddress).toScVal().toXDR('base64');
        const topic2 = new Address(toAddress).toScVal().toXDR('base64');

        const requestBody: GetEventsRequest = {
            // OPTIMIZATION: Use cached safe ledger if no explicit start provided.
            // Defaulting to 1 often causes "ledger range" errors on archived nodes, forcing a retry.
            startLedger: startLedger || (cachedSafeStartLedger > 0 ? cachedSafeStartLedger : 1),
            filters: [{
                type: 'contract',
                contractIds: [tokenContractId],
                topics: [
                    [topic0], // Function name: "transfer"
                    [topic1], // From
                    [topic2]  // To
                ]
            }],
            pagination: {
                limit: limit
            }
        };

        const rpcUrl = getBestRpcUrl();
        log.debug(LogCategory.RPC, 'Querying getEvents', { rpcUrl });

        // Helper to perform the fetch with one automatic retry for ledger range errors
        const fetchEvents = async (forceStartLedger?: number): Promise<EventResponse> => {
            requestBody.startLedger = forceStartLedger ?? requestBody.startLedger;

            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: RPC_METHOD,
                    params: requestBody
                })
            });

            if (!response.ok) {
                throw new Error(`RPC HTTP error: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();

            if (json.error) {
                // "startLedger must be within the ledger range: 60792655 - 60913614"
                if (json.error.code === -32600 && json.error.message.includes('ledger range')) {
                    const match = json.error.message.match(/range: (\d+) -/);
                    if (match && match[1]) {
                        const validStart = parseInt(match[1], 10) + 10; // Add buffer to avoid race condition

                        // Update cache so next call succeeds immediately
                        if (validStart > cachedSafeStartLedger) {
                            cachedSafeStartLedger = validStart;
                            log.debug(LogCategory.RPC, `Updated cached safe startLedger to ${cachedSafeStartLedger}`);
                        }

                        // Only retry if we haven't already forced a start ledger (prevent infinite loop)
                        if (!forceStartLedger) {
                            log.warn(LogCategory.RPC, `RPC requires recent startLedger. Retrying with ${validStart}...`);
                            return fetchEvents(validStart);
                        }
                    }
                }
                throw new Error(`RPC error: ${json.error.message} (code ${json.error.code})`);
            }

            return json.result as EventResponse;
        };

        const result = await fetchEvents(startLedger);

        if (!result.events || result.events.length === 0) {
            log.debug(LogCategory.RPC, 'No transfer events found');
            return [];
        }

        log.debug(LogCategory.RPC, `Found ${result.events.length} events`);

        const transfers: TokenTransfer[] = [];

        for (const event of result.events) {
            try {
                // Parse value (amount)
                const amountScVal = xdr.ScVal.fromXDR(event.value, 'base64');
                const rawAmount = scValToNative(amountScVal);

                // Assuming standard 7 decimals for Stellar tokens like KALE/XLM
                // Only if it's the KALE contract we know about. 
                // Ideally we check decimals, but hardcoding for known contracts is safe for this specific utility.
                const decimals = 7;
                const amount = Number(rawAmount) / Math.pow(10, decimals);

                transfers.push({
                    from: fromAddress,
                    to: toAddress,
                    amount: amount,
                    contractId: event.contractId,
                    ledger: event.ledger,
                    timestamp: new Date(event.ledgerClosedAt)
                });
            } catch (parseErr) {
                log.warn(LogCategory.RPC, 'Failed to parse event value', { error: parseErr });
            }
        }

        return transfers;

    } catch (error) {
        log.error(LogCategory.RPC, 'findTokenTransfers failed', undefined, error as Error);
        return [];
    }
}
