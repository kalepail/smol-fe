import { hash, Keypair } from "@stellar/stellar-sdk/minimal"
import { Server } from "@stellar/stellar-sdk/minimal/rpc"

export const keypair = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')))
export const publicKey = keypair.publicKey()

export const rpc = new Server(import.meta.env.PUBLIC_RPC_URL)

export function truncate(str: string, length: number = 5) {
    return `${str.slice(0, length)}...${str.slice(-length)}`
}