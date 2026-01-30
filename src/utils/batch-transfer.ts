/**
 * Batch Transfer via Soroban Contract
 * 
 * Calls the deployed batch transfer contract to send KALE to multiple
 * recipients in a single transaction with one signature.
 * 
 * Contract: CAZ4E2ZSMWMJDZQWB2OLXHYISBN6VSWUV2GOUM7AQ4ZDM4KBWHGKLDKX
 */

import {
    Contract,
    Address,
    nativeToScVal,
    TransactionBuilder,
    Networks,
    Account,
    rpc,
    xdr,
} from "@stellar/stellar-sdk";

const { Server, assembleTransaction } = rpc;

// RPC URL from environment or failover
const RPC_URL = import.meta.env.PUBLIC_RPC_URL || "https://rpc.ankr.com/stellar_soroban";

// Deployed batch transfer contract
const BATCH_CONTRACT_ID = "CAZ4E2ZSMWMJDZQWB2OLXHYISBN6VSWUV2GOUM7AQ4ZDM4KBWHGKLDKX";
const KALE_SAC_ID = import.meta.env.PUBLIC_KALE_SAC_ID;

// Official Stellar SDK Null Account for building unsigned transactions
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export interface BatchTransfer {
    to: string;      // Recipient address
    amount: bigint;  // Amount in raw units (with decimals)
}

/**
 * Build a batch transfer transaction for KALE using the batch contract.
 * Uses the NULL_ACCOUNT pattern consistent with swap-builder.ts.
 * 
 * @param from - The sender's contract address (C address) - used for auth
 * @param transfers - Array of recipients and amounts
 * @returns XDR string of the assembled transaction ready for signing
 */
export async function buildBatchKaleTransfer(
    from: string,
    transfers: BatchTransfer[]
): Promise<string> {
    if (transfers.length === 0) {
        throw new Error("No transfers provided");
    }

    if (!KALE_SAC_ID) {
        throw new Error("KALE C-Contract ID (PUBLIC_KALE_SAC_ID) is missing");
    }

    const server = new Server(RPC_URL);

    // Use NULL_ACCOUNT for building the transaction source
    // This avoids "accountId is invalid" error since Account requires a G-Address
    const sourceAccount = new Account(NULL_ACCOUNT, "0");

    console.log(`[BatchTransfer] Building batch contract call: From C-Addr ${from}, Transfers: ${transfers.length}, Contract: ${BATCH_CONTRACT_ID}`);

    const batchContract = new Contract(BATCH_CONTRACT_ID);

    // Build recipients and amounts as Soroban Vecs
    const recipientsScVal = xdr.ScVal.scvVec(
        transfers.map(t => nativeToScVal(new Address(t.to)))
    );
    // Use i128 for amounts as per contract definition in lib.rs
    const amountsScVal = xdr.ScVal.scvVec(
        transfers.map(t => nativeToScVal(t.amount, { type: "i128" }))
    );

    // Call batch_transfer(token, from, recipients, amounts)
    const batchCall = batchContract.call(
        "batch_transfer",
        nativeToScVal(new Address(KALE_SAC_ID)),     // token
        nativeToScVal(new Address(from)),            // from
        recipientsScVal,                             // recipients
        amountsScVal                                 // amounts
    );

    const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: "10000000", // 1 XLM max fee
        networkPassphrase: Networks.PUBLIC
    });

    const tx = txBuilder
        .addOperation(batchCall)
        .setTimeout(300)
        .build();

    console.log("[BatchTransfer] Simulating batch call...");

    const simResult = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
        console.error("[BatchTransfer] Simulation failed:", simResult.error);
        throw new Error(`Batch simulation failed: ${simResult.error}`);
    }

    // Diagnostics
    const successResult = simResult as any;
    const cpu = successResult.cost?.cpuInsns ?? "unknown";
    const mem = successResult.cost?.memBytes ?? "unknown";
    const fee = successResult.minResourceFee;
    const resultXdrSize = successResult.results?.[0]?.xdr?.length ?? 0;

    console.log(`[BatchTransfer] Simulation successful (Diagnostics):`);
    console.log(`   - CPU Instructions: ${cpu}`);
    console.log(`   - Memory Bytes: ${mem}`);
    console.log(`   - Min Resource Fee: ${fee}`);
    console.log(`   - Result XDR Size: ${resultXdrSize}`);
    console.log(`   - Events: ${successResult.events?.length ?? 0}`);

    if (parseInt(fee) > 10000000) {
        console.warn(`[BatchTransfer] WARNING: Fee ${fee} exceeds standard 1 XLM limit!`);
    }

    console.log("[BatchTransfer] Assembling final transaction...");

    const finalTx = assembleTransaction(tx, simResult).build();
    const finalXdr = finalTx.toXDR();

    console.log(`[BatchTransfer] Ready. Final XDR Length: ${finalXdr.length}`);
    return finalXdr;
}
