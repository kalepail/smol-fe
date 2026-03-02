/**
 * Dungeon Proof Worker — Real ZK proof generation for door attempts.
 *
 * Uses the existing tier_proof Circom circuit (Groth16/BN254) to generate
 * real, verifiable proofs for each door choice. The proof system:
 *
 * 1. Encodes door choice data into circuit-compatible inputs
 * 2. Generates a Poseidon commitment binding (balance, salt)
 * 3. Runs snarkjs Groth16 fullProve in the browser
 * 4. Returns proof + public signals (credential is the public `tier_id`)
 *
 * Architecture: This runs on the main thread with dynamic imports.
 * A true WebWorker version will follow when wasm-in-worker bundling is resolved.
 *
 * IMPORTANT: Door acceptance is a policy decision evaluated separately.
 * Proof generation + local verification are cryptographically real.
 */

// ── Types ────────────────────────────────────────────────────────────────────

import { normalizeCircomScalar } from "../../../../lib/the-farm/circomInputs";

export interface DoorProofInput {
    playerAddress: string;
    floor: number;
    doorChoice: number;
    attemptNonce: number;
    lobbyId: string;
    tierId: number;
    balance: bigint;
}

export interface DoorProofResult {
    proof: any;             // Groth16 proof object (pi_a, pi_b, pi_c)
    publicSignals: string[];
    commitment: string;     // Poseidon commitment hex
    commitmentBytes: Uint8Array; // 32-byte big-endian commitment (public input encoding for Tier Verifier)
    proofType: string;      // "Groth16" | "Circom" | "RISC Zero"
    provingTimeMs: number;
    tierId: number;
}

// ── Circuit Paths ────────────────────────────────────────────────────────────

const CIRCUIT_WASM = "/zk/tier_proof.wasm";
const PROVING_KEY = "/zk/tier_proof.zkey";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
}

/**
 * Vite can temporarily serve "Outdated Optimize Dep" (504) for dynamically imported deps
 * while it re-optimizes. Browsers auto-reload; Playwright won't. Retry a few times.
 */
async function importWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const msg = String((err as any)?.message || err);
            const isViteOutdated =
                msg.includes("Outdated Optimize Dep") ||
                msg.includes("Failed to fetch dynamically imported module") ||
                msg.includes("net::ERR_ABORTED");

            if (!isViteOutdated || attempt === 4) break;
            // Small backoff to let Vite finish optimizing.
            await sleep(150 * attempt);
        }
    }

    throw lastErr instanceof Error ? lastErr : new Error(`${label} import failed: ${String(lastErr)}`);
}

/** Hash a string to a field element (first 31 bytes of SHA-256) */
async function hashToField(input: string): Promise<bigint> {
    const data = new TextEncoder().encode(input);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(hashBuf);
    let hash = 0n;
    for (let i = 0; i < 31; i++) {
        hash = (hash << 8n) | BigInt(bytes[i]);
    }
    return hash;
}

/** Generate a cryptographically secure random salt (fits in BN254 Fr) */
function generateSalt(): bigint {
    const bytes = crypto.getRandomValues(new Uint8Array(31));
    let salt = 0n;
    for (const b of bytes) {
        salt = (salt << 8n) | BigInt(b);
    }
    return salt;
}

function bigintToBytes32(value: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    let v = value;
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return bytes;
}

/** Map floor to proof type label — matches game lore */
function proofTypeForFloor(floor: number): string {
    return "Groth16 (Circom)";
}

// ── Proof Generation ─────────────────────────────────────────────────────────

/**
 * Generate a real Groth16 proof for a door attempt.
 *
 * The proof proves:
 * - The prover knows private inputs: address_hash, encoded balance, salt
 * - commitment_expected = Poseidon(address_hash, balance, salt)
 * - tier_id is a public hint (we use 0 for the dungeon)
 *
 * Door acceptance is evaluated separately by the policy engine.
 */
export async function generateDoorProof(
    input: DoorProofInput,
): Promise<DoorProofResult> {
    const startTime = performance.now();
    const proofType = proofTypeForFloor(input.floor);

    console.log("[DoorProof] Generating proof:", {
        floor: input.floor,
        door: input.doorChoice,
        nonce: input.attemptNonce,
        proofType,
    });

    // 1. Derive inputs
    const salt = generateSalt();

    // IMPORTANT: Use the user's real KALE balance as the circuit balance input.
    // This keeps Groth16 proofs compatible with Tier Verifier on-chain verification.
    const balance = input.balance ?? 0n;

    // Keep address hashing consistent with the Farm circuit conventions.
    const addressHash = await hashToField(input.playerAddress);
    const tierId = input.tierId;

    // 2. Compute Poseidon commitment
    // @ts-ignore - circomlibjs lacks TS declarations
    const { buildPoseidon } = await importWithRetry("circomlibjs", () => import("circomlibjs"));
    const poseidon = await buildPoseidon();
    const commitmentField = poseidon.F.toString(
        poseidon([addressHash, balance, salt]),
    );
    const commitment = BigInt(commitmentField);
    const commitmentBytes = bigintToBytes32(commitment);

    // 3. Prepare circuit inputs
    const circuitInputs = {
        tier_id: normalizeCircomScalar(tierId, "tier_id"),
        commitment_expected: commitment.toString(),
        address_hash: addressHash.toString(),
        balance: balance.toString(),
        salt: salt.toString(),
    };

    // 4. Generate Groth16 proof via snarkjs
    // @ts-ignore - snarkjs types
    const snarkjs = await importWithRetry("snarkjs", () => import("snarkjs"));
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        CIRCUIT_WASM,
        PROVING_KEY,
    );

    const provingTimeMs = Math.round(performance.now() - startTime);

    console.log("[DoorProof] Proof generated:", {
        provingTimeMs,
        commitment: commitment.toString().slice(0, 20) + "...",
        tierId,
    });

    return {
        proof,
        publicSignals,
        commitment: commitment.toString(),
        commitmentBytes,
        proofType,
        provingTimeMs,
        tierId,
    };
}

/**
 * Verify a door proof locally (for debugging / UI feedback).
 * ZK Dungeon currently performs local verification only.
 */
export async function verifyDoorProofLocally(
    proof: any,
    publicSignals: string[],
): Promise<boolean> {
    const vkeyRes = await fetch("/zk/verification_key.json");
    const vkey = await vkeyRes.json();

    // @ts-ignore
    const snarkjs = await importWithRetry("snarkjs", () => import("snarkjs"));
    return snarkjs.groth16.verify(vkey, publicSignals, proof);
}
