
// ============================================================================
// Shared Types & Constants for ZK Farm System
// Single source of truth for all Farm types, constants, and helpers.
// ============================================================================

export const TIER_VERIFIER_CONTRACT_ID = "CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M";
export const STELLAR_NETWORK = "stellar-mainnet" as const;

// ── Testnet (hackathon mode) ────────────────────────────────────────────────
const envTierVerifierTestnet = import.meta.env.PUBLIC_TIER_VERIFIER_CONTRACT_ID_TESTNET;
export const TIER_VERIFIER_CONTRACT_ID_TESTNET =
    typeof envTierVerifierTestnet === "string" && envTierVerifierTestnet.trim().length > 0
        ? envTierVerifierTestnet.trim()
        : "";

export interface TierDef {
    name: string;
    icon: string;
    iconImage?: string;
    min: number;
    color: string;
    glow: string;
}

export const TIER_CONFIG: TierDef[] = [
    { name: 'Sprout', icon: '🌱', min: 0, color: '#86efac', glow: 'rgba(134,239,172,0.35)' },
    { name: 'Grower', icon: '🌿', min: 100, color: '#4ade80', glow: 'rgba(74,222,128,0.35)' },
    { name: 'Harvester', icon: '🥬', min: 1000, color: '#22c55e', glow: 'rgba(34,197,94,0.35)' },
    { name: 'Whale', icon: '🐋', min: 10000, color: '#0ea5e9', glow: 'rgba(14,165,233,0.35)' },
];

export const TIER_THRESHOLDS = {
    SPROUT: 0n,
    GROWER: 100n * 10_000_000n,      // 100 KALE
    HARVESTER: 1_000n * 10_000_000n, // 1,000 KALE
    WHALE: 10_000n * 10_000_000n,    // 10,000 KALE
};

export function getTierIdForBalance(balance: bigint): number {
    if (balance >= TIER_THRESHOLDS.WHALE) return 3;
    if (balance >= TIER_THRESHOLDS.HARVESTER) return 2;
    if (balance >= TIER_THRESHOLDS.GROWER) return 1;
    return 0;
}

export function getTierForBalance(balance: bigint): number {
    return getTierIdForBalance(balance);
}

export function formatKaleBalance(balance: bigint): string {
    return Number(balance / 10_000_000n).toLocaleString();
}

export function truncateHash(hash: string): string {
    return `${hash.slice(0, 8)}\u2026${hash.slice(-4)}`;
}

export interface TierProofInputs {
    tier_id: string;
    commitment_expected: string;
    address_hash: string;
    balance: string;
    salt: string;
}

export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: "groth16";
    curve: "bn254";
}

export interface ProofResult {
    proof: Groth16Proof;
    publicSignals: string[];
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

export type BadgeType =
    | 'proof-of-farm'
    | 'first-harvest'
    | 'melodist'
    | 'swapper'
    | 'quiz-master';

export interface BadgeDef {
    id: BadgeType;
    title: string;
    description: string;
    icon: string;
    available: boolean;
}

export interface EarnedBadge {
    id: BadgeType;
    earnedAt: number;
    data: Record<string, unknown>;
}

export interface ProofPacket {
    farmer: string;
    tier: number;
    commitment: string;
    salt: string;
}

export const BADGE_REGISTRY: BadgeDef[] = [
    {
        id: 'proof-of-farm',
        title: 'Proof of Farm',
        description: 'Commitment-attested farming tier on Stellar',
        icon: '🌾',
        available: true,
    },
    {
        id: 'first-harvest',
        title: 'First Harvest',
        description: 'Your first KALE balance snapshot',
        icon: '🫛',
        available: false,
    },
    {
        id: 'melodist',
        title: 'Melodist',
        description: 'Listened to 10 songs on smol',
        icon: '🎵',
        available: false,
    },
    {
        id: 'swapper',
        title: 'DEX Pioneer',
        description: 'Completed your first token swap',
        icon: '🔄',
        available: false,
    },
    {
        id: 'quiz-master',
        title: 'Quiz Master',
        description: 'Perfect score on Blind Quiz',
        icon: '🧠',
        available: false,
    },
];

export function buildProofPacket(badge: EarnedBadge, farmerAddress: string): ProofPacket {
    const data = badge.data as {
        tier?: number;
        commitment?: string;
        salt?: string;
    };
    return {
        farmer: farmerAddress,
        tier: data.tier ?? 0,
        commitment: data.commitment ?? "",
        salt: data.salt ?? "",
    };
}

const BADGES_STORAGE_KEY = "smol:farm:badges:v1";

export function loadAllBadges(): EarnedBadge[] {
    if (typeof window === "undefined") return [];

    try {
        const raw = window.localStorage.getItem(BADGES_STORAGE_KEY);
        if (!raw) return [];

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item) => item as Partial<EarnedBadge> | null)
            .filter((item): item is EarnedBadge => {
                return !!item && typeof item.id === "string" && typeof item.earnedAt === "number";
            })
            .map((item) => ({
                id: item.id,
                earnedAt: item.earnedAt,
                data: typeof item.data === "object" && item.data ? item.data : {},
            }));
    } catch {
        return [];
    }
}

export function saveEarnedBadge(badge: EarnedBadge): void {
    if (typeof window === "undefined") return;

    const existing = loadAllBadges();
    const next = [
        ...existing.filter((b) => b.id !== badge.id),
        badge,
    ];

    try {
        window.localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Non-fatal: storage may be full or blocked by user settings.
    }
}
