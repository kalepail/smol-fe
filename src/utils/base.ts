import { hash, Keypair } from "@stellar/stellar-sdk/minimal"
import { Server } from "@stellar/stellar-sdk/minimal/rpc"

export const keypair = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')))
export const publicKey = keypair.publicKey()

import { RPC_URL, recordRpcSuccess, recordRpcFailure } from "./rpc";

const rpcUrl = RPC_URL;
export const rpc = rpcUrl ? new Server(rpcUrl) : (null as Server | null);

export function getRpcServer(): Server {
    if (!rpc) {
        throw new Error("RPC server not configured. Please set PUBLIC_RPC_URL.");
    }
    return rpc;
}

/**
 * Safely get the latest ledger sequence with health tracking
 */
export async function getLatestSequence(): Promise<number> {
    const server = getRpcServer();
    const startTime = Date.now();

    try {
        const { sequence } = await server.getLatestLedger();
        const latency = Date.now() - startTime;

        // Record success for health monitoring
        recordRpcSuccess(RPC_URL, latency);

        return sequence;
    } catch (err) {
        // Record failure for health monitoring
        recordRpcFailure(RPC_URL);

        console.error("[getLatestSequence] Failed to fetch latest ledger:", err);
        throw new Error("Failed to connect to Stellar network. Please check your connection.");
    }
}

export function truncate(str: string, length: number = 5) {
    return `${str.slice(0, length)}...${str.slice(-length)}`
}

/**
 * Poll for a transaction until found or max attempts reached with health tracking
 * @param hash Transaction hash to poll for
 * @param attempts Max attempts (default 45 = ~90s)
 * @param interval ms between attempts (default 2000ms)
 */
export async function pollTransaction(hash: string, attempts: number = 45, interval: number = 2000): Promise<string> {
    const server = getRpcServer();
    let lastError: any = null;

    for (let i = 0; i < attempts; i++) {
        const startTime = Date.now();

        try {
            const tx = await server.getTransaction(hash);
            const latency = Date.now() - startTime;

            // Record success for health monitoring
            recordRpcSuccess(RPC_URL, latency);

            if (tx.status === "SUCCESS") {
                return tx.status;
            }
        } catch (e: any) {
            lastError = e;
            // NOT_FOUND is expected while pending, don't record as failure
            // Only record actual RPC failures
            if (e.message && !e.message.includes('NOT_FOUND')) {
                recordRpcFailure(RPC_URL);
            }
            // Continued polling
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    // If we exhausted all attempts, record as failure
    recordRpcFailure(RPC_URL);
    throw new Error(`Transaction ${hash} verification timed out after ${attempts} attempts`);
}