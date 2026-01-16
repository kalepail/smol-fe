/**
 * C Address Swap Builder
 * 
 * Builds swap transactions for smart wallets (C addresses) by invoking
 * the Soroswap Aggregator contract directly.
 * 
 * Based on kalepail/ohloss swapService.ts pattern.
 * 
 * @see https://github.com/kalepail/ohloss/blob/main/ohloss-frontend/src/lib/swapService.ts
 */

import {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Networks,
    Account
} from "@stellar/stellar-sdk/minimal";
import { Server, Api, assembleTransaction } from "@stellar/stellar-sdk/minimal/rpc";
import type { QuoteResponse, RawTradeDistribution } from "./soroswap";

/** 
 * Soroswap Aggregator Contract (Mainnet)
 * Uses the same contract as kalepail/ohloss which has confirmed compatible function signature
 * @see https://github.com/kalepail/ohloss/blob/main/ohloss-frontend/src/lib/swapService.ts
 */
export const AGGREGATOR_CONTRACT = "CAYP3UWLJM7ZPTUKL6R6BFGTRWLZ46LRKOXTERI2K6BIJAWGYY62TXTO";

/** Protocol ID mapping (matches aggregator contract enum) */
const PROTOCOL_MAP: Record<string, number> = {
    soroswap: 0,
    phoenix: 1,
    aqua: 2,
    comet: 3,
    sdex: 4
};

/** RPC endpoint */
const RPC_URL = import.meta.env.PUBLIC_RPC_URL || "https://rpc.ankr.com/stellar_soroban";

/** 
 * Stellar SDK's official NULL_ACCOUNT for building unsigned transactions
 * The relayer will rewrap the transaction with its own source account
 */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/** Extended distribution with optional poolHashes for aqua protocol */
interface ExtendedDistribution extends RawTradeDistribution {
    poolHashes?: string[];
}

/**
 * Build a swap transaction for C address using direct aggregator invocation
 * 
 * @param quote - Quote response from Soroswap API /quote
 * @param fromAddress - User's C address (smart wallet contract ID)
 * @returns Unsigned XDR string ready for PasskeyKit signing
 */
export async function buildSwapTransactionForCAddress(
    quote: QuoteResponse,
    fromAddress: string
): Promise<string> {
    console.log("[SwapBuilder] Starting buildSwapTransactionForCAddress", {
        quoteAmountIn: quote.amountIn,
        quoteAmountOut: quote.amountOut,
        fromAddress
    });

    const rawTrade = quote.rawTrade as {
        amountIn: string;
        amountOutMin: string;
        distribution: ExtendedDistribution[];
    };

    if (!rawTrade || !rawTrade.distribution) {
        console.error("[SwapBuilder] Invalid rawTrade - missing distribution", JSON.stringify(quote, null, 2));
        throw new Error("Quote does not contain valid rawTrade distribution");
    }

    console.log("[SwapBuilder] RawTrade:", JSON.stringify(rawTrade, null, 2));

    // Fallbacks for amountIn and amountOutMin if missing in rawTrade
    let amountIn = rawTrade.amountIn;
    let amountOutMin = rawTrade.amountOutMin;

    if (!amountIn) {
        console.warn("rawTrade.amountIn missing, falling back to quote.amountIn");
        amountIn = quote.amountIn;
    }

    if (!amountOutMin) {
        console.warn("rawTrade.amountOutMin missing, falling back to quote.otherAmountThreshold");
        // otherAmountThreshold is likely a number in stroops, convert to string
        amountOutMin = String(quote.otherAmountThreshold);
    }

    // Deadline: 1 hour from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const server = new Server(RPC_URL);
    const contract = new Contract(AGGREGATOR_CONTRACT);

    // Use NULL_ACCOUNT as source - the relayer will rewrap with its funded account
    const sourceAccount = new Account(NULL_ACCOUNT, "0");

    // Get token addresses from the quote's distribution path
    const firstPath = rawTrade.distribution[0]?.path || [];
    const tokenIn = firstPath[0];
    const tokenOut = firstPath[firstPath.length - 1];

    if (!tokenIn || !tokenOut) {
        throw new Error("Could not determine token addresses from quote distribution");
    }

    // Build distribution ScVal array with proper structure
    const distributionArg = buildDistributionArg(rawTrade.distribution);

    // Build the contract invocation with all 7 required arguments
    const invokeArgs = [
        nativeToScVal(new Address(tokenIn)),                         // token_in
        nativeToScVal(new Address(tokenOut)),                        // token_out
        nativeToScVal(BigInt(amountIn), { type: "i128" }),  // amount_in
        nativeToScVal(BigInt(amountOutMin), { type: "i128" }), // amount_out_min
        distributionArg,                                              // distribution
        nativeToScVal(new Address(fromAddress)),                      // to (C-address)
        nativeToScVal(deadline, { type: "u64" }),                    // deadline
    ];

    console.log("[SwapBuilder] Contract Invocation Args:", {
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMin,
        to: fromAddress,
        deadline
    });

    const invokeOp = contract.call("swap_exact_tokens_for_tokens", ...invokeArgs);

    // Build transaction with NULL_ACCOUNT as source
    const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000000", // 1 XLM max fee
        networkPassphrase: Networks.PUBLIC
    })
        .addOperation(invokeOp)
        .setTimeout(300)
        .build();

    // Simulate to get auth entries and resource costs
    const simResult = await server.simulateTransaction(tx);

    if (Api.isSimulationError(simResult)) {
        throw new Error(`Simulation failed: ${simResult.error}`);
    }

    // Assemble the transaction with simulation results
    const assembledTx = assembleTransaction(tx, simResult);
    const builtTx = assembledTx.build();

    return builtTx.toXDR();
}

/**
 * Convert pool hashes to ScVal (Option<Vec<BytesN<32>>>)
 */
function poolHashesToScVal(poolHashes?: string[]): xdr.ScVal {
    if (!poolHashes || poolHashes.length === 0) {
        return xdr.ScVal.scvVoid();
    }

    const scVec: xdr.ScVal[] = poolHashes.map((base64Str) => {
        const binaryString = atob(base64Str);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        if (bytes.length !== 32) {
            throw new Error(`Expected 32 bytes, got ${bytes.length}`);
        }
        // Convert to Buffer for xdr.ScVal.scvBytes
        return xdr.ScVal.scvBytes(Buffer.from(bytes));
    });

    return xdr.ScVal.scvVec(scVec);
}

/**
 * Build the distribution argument as ScVal
 */
function buildDistributionArg(distribution: ExtendedDistribution[]): xdr.ScVal {
    return xdr.ScVal.scvVec(
        distribution.map(d => buildDexDistributionScVal(d))
    );
}

/**
 * Build a single DexDistribution as ScVal struct
 * IMPORTANT: Fields must be in alphabetical order for Soroban!
 */
function buildDexDistributionScVal(dist: ExtendedDistribution): xdr.ScVal {
    const protocolId = typeof dist.protocol_id === "string"
        ? PROTOCOL_MAP[dist.protocol_id.toLowerCase()] ?? 0
        : dist.protocol_id;

    // Fields in alphabetical order: bytes, parts, path, protocol_id
    const entries: xdr.ScMapEntry[] = [
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("bytes"),
            val: poolHashesToScVal(dist.poolHashes)
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("parts"),
            val: nativeToScVal(dist.parts, { type: "u32" })
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("path"),
            val: nativeToScVal(dist.path.map(addr => new Address(addr)))
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("protocol_id"),
            val: nativeToScVal(protocolId, { type: "u32" })
        })
    ];

    return xdr.ScVal.scvMap(entries);
}

/**
 * Check if an address is a C address (contract)
 */
export function isCAddress(address: string): boolean {
    return address.startsWith("C");
}

/**
 * Check if an address is a G address (account)
 */
export function isGAddress(address: string): boolean {
    return address.startsWith("G");
}
