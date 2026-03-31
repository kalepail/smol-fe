import { hash, Keypair } from "@stellar/stellar-sdk/minimal"
import { Server } from "@stellar/stellar-sdk/minimal/rpc"

// Deterministic throwaway keypair used solely as a default "source account" for
// building and simulating Soroban transactions on the client. It never signs
// anything sensitive -- real user signatures are applied separately. The seed is
// intentionally hardcoded and public; the resulting account holds no funds and
// carries no privileges.
export const keypair = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')))
export const publicKey = keypair.publicKey()

export const rpc = new Server(import.meta.env.PUBLIC_RPC_URL)

export function truncate(str: string, length: number = 5) {
    return `${str.slice(0, length)}...${str.slice(-length)}`
}