/**
 * C Address Swap Builder
 * 
 * Builds swap transactions for smart wallets (C addresses) by invoking
 * the Soroswap Router contract directly.
 * 
 * DEFINITIVE ARCHITECTURE:
 * Based on live mainnet contract inspection of CAG5L... (Soroswap Router).
 * Signature confirmed via 'stellar contract inspect --wasm contract.wasm'
 */

import {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Networks,
    Account,
    rpc
} from "@stellar/stellar-sdk";
const { Server, Api, assembleTransaction } = rpc;
import type { QuoteResponse, RawTradeDistribution } from "./soroswap";
import logger, { LogCategory } from "./debug-logger";
import { safeStringify } from "./soroswap";



/**
 * Soroswap Router Contract (Mainnet)
 * Verified: This is a ROUTER, not an Aggregator.
 */
export const AGGREGATOR_CONTRACT = import.meta.env.PUBLIC_AGGREGATOR_CONTRACT_ID || "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";

/** RPC endpoint */
const RPC_URL = import.meta.env.PUBLIC_RPC_URL || "https://rpc.ankr.com/stellar_soroban";

/** 
 * Stellar SDK's official NULL_ACCOUNT for building unsigned transactions
 */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Validate that amounts are valid numeric strings before BigInt conversion
 */
function validateAmount(value: string, fieldName: string): void {
    const trimmed = String(value).trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) {
        throw new Error(`Invalid ${fieldName}: "${value}" - must be a positive integer string`);
    }
    try {
        BigInt(trimmed);
    } catch (error) {
        throw new Error(`Cannot convert ${fieldName} to BigInt: "${value}" - ${error}`);
    }
}

/**
 * Build a swap transaction for C address using direct Router invocation
 *
 * SIGNATURE (Verified via WASM inspection):
 * swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline)
 * swap_tokens_for_exact_tokens(amount_out, amount_in_max, path, to, deadline)
 * 
 * where 'path' is Vec<Address>
 */
export async function buildSwapTransactionForCAddress(
    quote: QuoteResponse,
    fromAddress: string
): Promise<string> {
    console.log("[SwapBuilder] Starting buildSwapTransactionForCAddress (Router Mode)", {
        quoteAmountIn: quote.amountIn,
        quoteAmountOut: quote.amountOut,
        fromAddress
    });

    const rawTrade = quote.rawTrade as {
        amountIn: string;
        amountOutMin?: string;
        amountInMax?: string;
        amountOut?: string;
        distribution: RawTradeDistribution[];
    };

    if (!rawTrade || !rawTrade.distribution || rawTrade.distribution.length === 0) {
        throw new Error("Quote does not contain valid rawTrade distribution");
    }

    const tradeType = quote.tradeType || 'EXACT_IN';
    console.log(`[SwapBuilder] Trade Type: ${tradeType}`);

    let amount1: string;
    let amount2: string;
    let methodName: string;

    if (tradeType === 'EXACT_OUT') {
        amount1 = rawTrade.amountOut || String(quote.amountOut);
        amount2 = rawTrade.amountInMax || String(quote.amountIn);
        methodName = "swap_tokens_for_exact_tokens";
    } else {
        amount1 = String(quote.amountIn);
        amount2 = rawTrade.amountOutMin || String(quote.amountOut);
        methodName = "swap_exact_tokens_for_tokens";
    }

    validateAmount(amount1, 'amount1');
    validateAmount(amount2, 'amount2');

    /**
     * EXTRACT PATH
     * The Router doesn't support complex distributions.
     * We must take the path with the most parts (highest weight).
     */
    const sortedDist = [...rawTrade.distribution].sort((a, b) => b.parts - a.parts);
    const bestDist = sortedDist[0];
    const path = bestDist.path || [];

    if (path.length < 2) {
        throw new Error("Invalid path found in quote distribution");
    }

    // Deadline: 1 hour from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const server = new Server(RPC_URL);
    const contract = new Contract(AGGREGATOR_CONTRACT);
    const sourceAccount = new Account(NULL_ACCOUNT, "0");

    /**
     * BUILD ROUTER ARGS (5 ARGUMENTS)
     * Signature: swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline)
     */
    const invokeArgs = [
        nativeToScVal(BigInt(amount1), { type: "i128" }),
        nativeToScVal(BigInt(amount2), { type: "i128" }),
        nativeToScVal(path.map(addr => new Address(addr))),
        nativeToScVal(new Address(fromAddress)),
        nativeToScVal(deadline, { type: "u64" }),
    ];

    console.log(`[SwapBuilder] Built ${methodName} args (Router 5-arg):`, {
        amount1,
        amount2,
        path,
        to: fromAddress,
        deadline: deadline.toString()
    });

    const invokeOp = contract.call(methodName, ...invokeArgs);

    const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000000",
        networkPassphrase: Networks.PUBLIC
    })
        .addOperation(invokeOp)
        .setTimeout(300)
        .build();

    const currentXdr = tx.toXDR();

    // Log the base XDR before simulation
    logger.info(LogCategory.TRANSACTION, `Swap Transaction Built (Pre-Sim) - ${methodName}`, {
        xdr: currentXdr,
        tradeType,
        method: methodName,
        from: fromAddress,
        path
    });

    const simResult = await server.simulateTransaction(tx);

    if (Api.isSimulationError(simResult)) {
        throw new Error(`Simulation failed: ${simResult.error}`);
    }

    const finalTx = assembleTransaction(tx, simResult).build();
    const finalXdr = finalTx.toXDR();

    logger.info(LogCategory.TRANSACTION, "Swap Transaction Simulated & Assembled", {
        xdr: finalXdr,
        tradeType,
        method: methodName,
        from: fromAddress
    });

    return finalXdr;
}

export function isCAddress(address: string): boolean {
    return address.startsWith("C");
}

export function isGAddress(address: string): boolean {
    return address.startsWith("G");
}
