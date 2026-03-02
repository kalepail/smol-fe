import { generateRandomSalt, poseidonHash, hashAddress } from "./zkProof";

// Helper to hash string to bigint (for game IDs)
async function hashString(str: string): Promise<bigint> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return BigInt("0x" + hex.slice(0, 60)); // Truncate to fit in field
}

export type ZkGameProof = {
    id: string;
    title: string;
    wallet: string;
    level: number;
    score: number;
    actions: unknown;
    actionHash: string;
    commitment: string;
    salt: string;
    createdAt: number;
    onchainTxHash?: string;
    onchainTier?: number;
    onchainCommitment?: string;
    onchainSubmittedAt?: number;
    onchainMode?: "tier-compat-v1";
};

export type GameProofPacket = {
    gameId: string;
    wallet: string;
    level: number;
    score: number;
    actionHash: string;
    commitment: string;
    salt: string;
    createdAt: number;
    network: "stellar-mainnet";
};

const STORAGE_KEY = "farm:game-proofs";
const WALLET_KEY = "farm:game-wallet";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function createGameProof(
    gameId: string,
    title: string,
    wallet: string,
    level: number,
    score: number,
    actions: unknown,
): Promise<ZkGameProof> {
    const salt = generateRandomSalt(); // BigInt
    // Hash actions to a field element (via SHA-256 first)
    // actions is an object { actions: string[], goal: string }
    const encoder = new TextEncoder();
    const actionData = encoder.encode(JSON.stringify(actions));
    const actionDigest = await crypto.subtle.digest("SHA-256", actionData);
    const actionHashHex = Array.from(new Uint8Array(actionDigest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const actionHashInt = BigInt("0x" + actionHashHex.slice(0, 60));

    // Inputs for the commitment:
    // 1. Wallet Address Hash (BigInt)
    // 2. Game ID Hash (BigInt)
    // 3. Level (BigInt)
    // 4. Score (BigInt)
    // 5. Action Hash (BigInt)
    // 6. Salt (BigInt)

    // If wallet is "guest", hash it as string; if address, use hashAddress
    let walletHash: bigint;
    if (wallet.startsWith("G") && wallet.length === 56) {
        walletHash = await hashAddress(wallet);
    } else {
        walletHash = await hashString(wallet);
    }

    const gameIdHash = await hashString(gameId);

    // Compute commitment: Poseidon([wallet, gameId, level, score, actionHash, salt])
    const commitmentInt = await poseidonHash([
        walletHash,
        gameIdHash,
        BigInt(level),
        BigInt(score),
        actionHashInt,
        salt,
    ]);

    return {
        id: gameId,
        title,
        wallet,
        level,
        score,
        actions,
        actionHash: actionHashHex,
        commitment: commitmentInt.toString(), // Store as string for JSON
        salt: salt.toString(),
        createdAt: Date.now(),
    };
}

export function buildGameProofPacket(proof: ZkGameProof): GameProofPacket {
    return {
        gameId: proof.id,
        wallet: proof.wallet,
        level: proof.level,
        score: proof.score,
        actionHash: proof.actionHash,
        commitment: proof.commitment,
        salt: proof.salt,
        createdAt: proof.createdAt,
        network: "stellar-mainnet",
    };
}

function storageKey(wallet: string): string {
    return `${STORAGE_KEY}:${wallet}`;
}

export function loadGameProofs(wallet: string): Record<string, ZkGameProof> {
    try {
        const raw = localStorage.getItem(storageKey(wallet));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function saveGameProof(wallet: string, proof: ZkGameProof): void {
    const current = loadGameProofs(wallet);
    current[proof.id] = proof;
    localStorage.setItem(storageKey(wallet), JSON.stringify(current));
}

export function getOrCreateGameWalletId(): string {
    const existing = localStorage.getItem(WALLET_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const suffix = bytesToHex(bytes);
    const walletId = `GUEST-${suffix}`;
    localStorage.setItem(WALLET_KEY, walletId);
    return walletId;
}
