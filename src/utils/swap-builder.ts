/**
 * C Address Swap Builder
 * 
 * Builds swap transactions for smart wallets (C addresses) by invoking
 * the Soroswap Aggregator contract directly, bypassing the API's
 * G-address-only limitation.
 * 
 * @see https://deepwiki.com/soroswap/aggregator
 */

import {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Networks,
    Operation,
    Account,
    SorobanRpc
} from "@stellar/stellar-sdk";
import type { QuoteResponse, RawTradeDistribution } from "./soroswap";

/** Soroswap Aggregator Contract (Mainnet) */
export const AGGREGATOR_CONTRACT = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";

/** Protocol ID mapping */
const PROTOCOL_MAP: Record<string, number> = {
    soroswap: 0,
    phoenix: 1,
    aqua: 2,
    comet: 3,
    sdex: 4  // Standard DEX might be used
};

/** RPC endpoint */
const RPC_URL = import.meta.env.PUBLIC_RPC_URL || "https://mainnet.stellar.validationcloud.io/v1/XJPslNKALS7FWSNjyYXoRG4qXQPkTNeVfxQIVtIg-Ek";

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
    const rawTrade = quote.rawTrade as {
        amountIn: string;
        amountOutMin: string;
        distribution: RawTradeDistribution[];
    };

    if (!rawTrade || !rawTrade.distribution) {
        throw new Error("Quote does not contain valid rawTrade distribution");
    }

    // Calculate deadline (current time + 5 minutes)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    // Create RPC server
    const server = new SorobanRpc.Server(RPC_URL);

    // Get source account (we'll use the aggregator as placeholder, auth comes from C address)
    // For Soroban, we need a valid source account for the TX envelope
    const sourceAccount = await server.getAccount(fromAddress).catch(() => {
        // C addresses don't have sequence numbers like G addresses
        // Use a synthetic account for building
        return new Account(fromAddress, "0");
    });

    // Create aggregator contract instance
    const aggregator = new Contract(AGGREGATOR_CONTRACT);

    // Build distribution ScVal array
    const distributionArg = buildDistributionArg(rawTrade.distribution);

    // Build the contract invocation
    const invokeOp = aggregator.call(
        "swap_exact_tokens_for_tokens",
        // from: Address
        nativeToScVal(Address.fromString(fromAddress), { type: "address" }),
        // amount_in: i128
        nativeToScVal(BigInt(rawTrade.amountIn), { type: "i128" }),
        // amount_out_min: i128
        nativeToScVal(BigInt(rawTrade.amountOutMin), { type: "i128" }),
        // distribution: Vec<DexDistribution>
        distributionArg,
        // deadline: u64
        nativeToScVal(deadline, { type: "u64" })
    );

    // Build transaction
    const tx = new TransactionBuilder(sourceAccount, {
        fee: "100000", // 0.01 XLM max fee
        networkPassphrase: Networks.PUBLIC
    })
        .addOperation(invokeOp)
        .setTimeout(300)
        .build();

    // Simulate to get proper footprint and auth requirements
    const simulated = await server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simulated)) {
        throw new Error(`Simulation failed: ${simulated.error}`);
    }

    // Prepare the transaction with simulation results
    const prepared = SorobanRpc.assembleTransaction(tx, simulated).build();

    return prepared.toXDR();
}

/**
 * Build the distribution argument as ScVal
 */
function buildDistributionArg(distribution: RawTradeDistribution[]): xdr.ScVal {
    return xdr.ScVal.scvVec(
        distribution.map(d => buildDexDistributionScVal(d))
    );
}

/**
 * Build a single DexDistribution as ScVal struct
 */
function buildDexDistributionScVal(dist: RawTradeDistribution): xdr.ScVal {
    const protocolId = typeof dist.protocol_id === "string"
        ? PROTOCOL_MAP[dist.protocol_id.toLowerCase()] ?? 0
        : dist.protocol_id;

    const entries: xdr.ScMapEntry[] = [
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("protocol_id"),
            val: xdr.ScVal.scvU32(protocolId)
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("path"),
            val: xdr.ScVal.scvVec(
                dist.path.map(addr =>
                    nativeToScVal(Address.fromString(addr), { type: "address" })
                )
            )
        }),
        new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("parts"),
            val: xdr.ScVal.scvU32(dist.parts)
        })
    ];

    // Add bytes field if present (protocol-specific data)
    // For now, omit as most protocols don't require it

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
