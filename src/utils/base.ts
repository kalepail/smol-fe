import { hash, Keypair } from "@stellar/stellar-sdk/minimal"
import { Server } from "@stellar/stellar-sdk/minimal/rpc"

export const keypair = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')))
export const publicKey = keypair.publicKey()

const rpcUrl = import.meta.env.PUBLIC_RPC_URL;
export const rpc = rpcUrl ? new Server(rpcUrl) : (null as unknown as Server);

export function getRpcServer(): Server {
    if (!import.meta.env.PUBLIC_RPC_URL) {
        throw new Error("RPC server not configured. Please set PUBLIC_RPC_URL.");
    }
    return rpc;
}

export function truncate(str: string, length: number = 5) {
    return `${str.slice(0, length)}...${str.slice(-length)}`
}