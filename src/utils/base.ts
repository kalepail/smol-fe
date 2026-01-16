import { hash, Keypair } from "@stellar/stellar-sdk/minimal"
import { Server } from "@stellar/stellar-sdk/minimal/rpc"

export const keypair = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')))
export const publicKey = keypair.publicKey()

import { RPC_URL } from "./rpc";

const rpcUrl = RPC_URL;
export const rpc = rpcUrl ? new Server(rpcUrl) : (null as Server | null);

export function getRpcServer(): Server {
    if (!rpc) {
        throw new Error("RPC server not configured. Please set PUBLIC_RPC_URL.");
    }
    return rpc;
}

/**
 * Safely get the latest ledger sequence
 */
export async function getLatestSequence(): Promise<number> {
    const server = getRpcServer();
    try {
        const { sequence } = await server.getLatestLedger();
        return sequence;
    } catch (err) {
        console.error("[getLatestSequence] Failed to fetch latest ledger:", err);
        throw new Error("Failed to connect to Stellar network. Please check your connection.");
    }
}

export function truncate(str: string, length: number = 5) {
    return `${str.slice(0, length)}...${str.slice(-length)}`
}

/**
 * Poll for a transaction until found or max attempts reached
 * @param hash Transaction hash to poll for
 * @param attempts Max attempts (default 45 = ~90s)
 * @param interval ms between attempts (default 2000ms)
 */
export async function pollTransaction(hash: string, attempts: number = 45, interval: number = 2000): Promise<string> {
    const server = getRpcServer();
    for (let i = 0; i < attempts; i++) {
        try {
            const tx = await server.getTransaction(hash);
            if (tx.status === "SUCCESS") {
                return tx.status;
            }
        } catch (e: any) {
            // NOT_FOUND is expected while pending
            // Continued polling
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Transaction ${hash} verification timed out after ${attempts} attempts`);
}