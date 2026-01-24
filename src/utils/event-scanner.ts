import { xdr, scValToNative, Address } from '@stellar/stellar-sdk';
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
export async function findTokenTransfers(
    fromAddress: string,
    toAddress: string,
    tokenContractId: string,
    options: {
        limit?: number;
        startLedger?: number; // Defaults to recent history if not specified
    } = {}
): Promise<TokenTransfer[]> {
    const log = logger; // Use global logger or create scoped one if preferred
    const { limit = 100, startLedger } = options;

    log.debug(LogCategory.RPC, 'findTokenTransfers called', { fromAddress, toAddress, tokenContractId });

    try {
        // Encode topics for filtering: ['transfer', from, to]
        // This is the standard Soroban Token Interface event structure
        const topic0 = xdr.ScVal.scvSymbol('transfer').toXDR('base64');
        const topic1 = new Address(fromAddress).toScVal().toXDR('base64');
        const topic2 = new Address(toAddress).toScVal().toXDR('base64');

        const requestBody: GetEventsRequest = {
            // If startLedger is not provided, we might scan from 0? 
            // Better to default to a reasonable lookback or 0 if we want full history.
            // However, getEvents has strict limits (10k ops window usually).
            // For now, let's omit startLedger to get latest events if supported, or start from 0 if required.
            // NOTE: RPC requires startLedger. We'll default to 'latest' minus some range or just rely on pagination.
            // Actually, official RPC documentation usually requires a range.
            // Let's rely on the RPC defaults or start from a known ledger if passed.
            // A safe default for "restore purchases" might be checking the last ~30-90 days ledgers?
            // User purchase might be old. Let's start from 0? That might timeout.
            // Let's try iterating from latest backwards? No, RPC events are forward.
            // We will set startLedger to 0 if not provided, but be aware of limits.
            // RPC requires startLedger to be a positive integer (not 0, not missing)
            startLedger: startLedger || 1,
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
            requestBody.startLedger = forceStartLedger ?? (requestBody.startLedger || 1);

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
            log.info(LogCategory.RPC, 'No transfer events found');
            return [];
        }

        log.info(LogCategory.RPC, `Found ${result.events.length} events`);

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
