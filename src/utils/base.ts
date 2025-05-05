import { hash, Keypair } from "@stellar/stellar-sdk/minimal";

export const keypair = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')));
export const publicKey = keypair.publicKey()

export function truncate(str: string, length: number = 5) {
    return `${str.slice(0, length)}...${str.slice(-length)}`;
}