import { hash, Keypair } from "@stellar/stellar-sdk/minimal"
import { Server } from "@stellar/stellar-sdk/minimal/rpc"

export const keypair = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')))
export const publicKey = keypair.publicKey()

const rpcUrl = import.meta.env.PUBLIC_RPC_URL;
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