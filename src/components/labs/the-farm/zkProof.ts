/**
 * Real ZK Proof Generation — Browser-side Groth16 proof generation using snarkjs.
 *
 * This module provides the REAL proof generation path for Proof of Farm tier verification.
 * It uses snarkjs to generate Groth16 proofs that can be verified on-chain via Protocol 25
 * BN254 host functions (CAP-0074).
 *
 * ## Architecture
 * 1. Browser loads circuit WASM + proving key from /public/zk/
 * 2. User provides private inputs (balance, salt)
 * 3. snarkjs generates Groth16 witness + proof
 * 4. Proof is serialized to BN254 uncompressed point format
 * 5. Proof is submitted to Soroban tier-verifier contract for on-chain pairing check
 *
 * ## Files Required (in /public/zk/)
 * - tier_proof.wasm     — Compiled circuit (circom 2.1.0)
 * - tier_proof.zkey     — Proving key (Groth16 BN254)
 * - verification_key.json — Verification key (for local verification debug)
 */

import {
    type ProofResult,
    type TierProofInputs,
    type Groth16Proof,
    TIER_VERIFIER_CONTRACT_ID,
} from "./zkTypes";
import type { DungeonNetworkConfig } from "../../../lib/dungeon/networkConfig";
import { normalizeCircomScalar } from "../../../lib/the-farm/circomInputs";

// ============================================================================
// Poseidon Hash (matches the circomlib Poseidon template used by our circuit)
// ============================================================================

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
    // @ts-ignore - circomlibjs lacks TypeScript declarations
    const { buildPoseidon } = await import("circomlibjs");
    const poseidon = await buildPoseidon();
    const hash = poseidon.F.toString(poseidon(inputs));
    return BigInt(hash);
}

// ============================================================================
// Proof Generation
// ============================================================================

// Cache-busting version for artifacts to fix net::ERR_CACHE_READ_FAILURE in production
const ZK_VERSION = Date.now();
const CIRCUIT_WASM_PATH = `/zk/tier_proof.wasm?v=${ZK_VERSION}`;
const PROVING_KEY_PATH = `/zk/tier_proof.zkey?v=${ZK_VERSION}`;

/**
 * Generate a Groth16 proof for tier verification.
 *
 * @param addressHash - Hash of user's Stellar address (field element)
 * @param balance - KALE balance in stroops
 * @param salt - Random salt (field element)
 * @param tierId - Claimed tier (0-3)
 * @returns Proof and public signals
 */
export async function generateTierProof(
    addressHash: bigint,
    balance: bigint,
    salt: bigint,
    tierId: number,
): Promise<ProofResult> {
    // 1. Compute the Poseidon commitment that the circuit will verify
    // Circuit: commitment_expected = Poseidon(address_hash, balance, salt)
    const commitment = await poseidonHash([addressHash, balance, salt]);

    // 2. Prepare inputs for the circuit
    const inputs: TierProofInputs = {
        tier_id: normalizeCircomScalar(tierId, "tier_id"),
        commitment_expected: commitment.toString(),
        address_hash: addressHash.toString(),
        balance: balance.toString(),
        salt: salt.toString(),
    };

    // 3. Generate the proof via snarkjs
    console.log("[ZK] Generating Groth16 proof...", { tierId, commitment: commitment.toString() });

    // @ts-ignore - snarkjs types (Robust fallback for production/Cloudflare)
    const snarkjs = (window as any).snarkjs || await import("snarkjs");

    if (import.meta.env.DEV) {
        const shape = Object.fromEntries(
            Object.entries(inputs).map(([key, value]) => [
                key,
                { type: typeof value, isArray: Array.isArray(value) },
            ]),
        );
        console.log("[ZK][CircomInputs] shape", shape, {
            tier_id: { value: inputs.tier_id, type: typeof inputs.tier_id, isArray: Array.isArray(inputs.tier_id) },
        });
    }

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        CIRCUIT_WASM_PATH,
        PROVING_KEY_PATH,
    );

    console.log("[ZK] Proof generated successfully");

    return {
        proof: proof as Groth16Proof,
        publicSignals,
    };
}

/**
 * Verify a proof locally using the verification key (for debugging).
 * In production, verification happens on-chain via the tier-verifier contract.
 */
export async function verifyProofLocally(
    proof: Groth16Proof,
    publicSignals: string[],
): Promise<boolean> {
    const vkeyResponse = await fetch(`/zk/verification_key.json?v=${ZK_VERSION}`);
    const vkey = await vkeyResponse.json();

    // @ts-ignore - snarkjs types (Robust fallback for production/Cloudflare)
    const snarkjs = (window as any).snarkjs || await import("snarkjs");
    return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

/**
 * Validate proof payload shape before serialization.
 * Local cryptographic validity is already checked via groth16.verify().
 */
function validateProofShape(proof: Groth16Proof): void {
    const isPoint2 = (p: unknown): p is string[] =>
        Array.isArray(p) && p.length >= 2 && typeof p[0] === "string" && typeof p[1] === "string";
    const isPoint2x2 = (p: unknown): p is string[][] =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Array.isArray(p[0]) &&
        Array.isArray(p[1]) &&
        p[0].length >= 2 &&
        p[1].length >= 2 &&
        typeof p[0][0] === "string" &&
        typeof p[0][1] === "string" &&
        typeof p[1][0] === "string" &&
        typeof p[1][1] === "string";

    if (!proof || !isPoint2(proof.pi_a) || !isPoint2x2(proof.pi_b) || !isPoint2(proof.pi_c)) {
        throw new Error("Proof payload is malformed. Regenerate the proof and try again.");
    }

    // Ensure values are parseable as unsigned field elements.
    const numericLeaves = [
        proof.pi_a[0],
        proof.pi_a[1],
        proof.pi_b[0][0],
        proof.pi_b[0][1],
        proof.pi_b[1][0],
        proof.pi_b[1][1],
        proof.pi_c[0],
        proof.pi_c[1],
    ];
    for (const value of numericLeaves) {
        if (!/^\d+$/.test(value)) {
            throw new Error("Proof payload contains non-numeric coordinates.");
        }
        // Throws on malformed numeric strings.
        BigInt(value);
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a cryptographically secure random salt that fits in BN254 Fr.
 */
export function generateRandomSalt(): bigint {
    const bytes = crypto.getRandomValues(new Uint8Array(31)); // 248 bits, fits in Fr
    let salt = 0n;
    for (const b of bytes) {
        salt = (salt << 8n) | BigInt(b);
    }
    return salt;
}

/**
 * Hash a Stellar address to a field element for the circuit.
 * Takes first 31 bytes of SHA-256 to fit in BN254 scalar field.
 */
export async function hashAddress(stellarAddress: string): Promise<bigint> {
    const encoder = new TextEncoder();
    const data = encoder.encode(stellarAddress);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    // Take first 31 bytes to fit in BN254 field
    let hash = 0n;
    for (let i = 0; i < 31; i++) {
        hash = (hash << 8n) | BigInt(hashArray[i]);
    }
    return hash;
}

// ============================================================================
// BN254 Point Serialization (Protocol 25 / CAP-0074 format)
// ============================================================================

/**
 * Serialize a bigint to a 32-byte big-endian Uint8Array.
 */
function bigintToBytes32(value: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    let v = value;
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return bytes;
}

/**
 * Serialize a G1 point (x, y) to 64 bytes uncompressed BN254 format.
 * Format: be_encode(X) || be_encode(Y), 32 bytes each.
 * snarkjs pi_a format: [x, y, "1"] — third element is projective z-coord.
 */
export function serializeG1(point: string[]): Uint8Array {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);
    const result = new Uint8Array(64);
    result.set(bigintToBytes32(x), 0);
    result.set(bigintToBytes32(y), 32);
    return result;
}

/**
 * Serialize a G2 point to 128 bytes uncompressed BN254 format.
 * snarkjs pi_b format is typically [[x_c0, x_c1], [y_c0, y_c1], ["1","0"]]
 *
 * CAP-0074 G2 encoding: be_encode(X_c1) || be_encode(X_c0) || be_encode(Y_c1) || be_encode(Y_c0)
 */
type G2EncodingMode = "cap0074" | "legacy";

export function serializeG2(
    point: string[][],
    mode: G2EncodingMode = "cap0074",
): Uint8Array {
    const x0 = BigInt(point[0][0]);
    const x1 = BigInt(point[0][1]);
    const y0 = BigInt(point[1][0]);
    const y1 = BigInt(point[1][1]);

    // snarkjs typically emits Fp2 limbs in [c0, c1] order, while CAP-0074 expects c1||c0.
    const [x_c1, x_c0, y_c1, y_c0] =
        mode === "cap0074"
            ? [x1, x0, y1, y0]
            : [x0, x1, y0, y1];

    const result = new Uint8Array(128);
    result.set(bigintToBytes32(x_c1), 0);
    result.set(bigintToBytes32(x_c0), 32);
    result.set(bigintToBytes32(y_c1), 64);
    result.set(bigintToBytes32(y_c0), 96);
    return result;
}

/**
 * Serialize a full Groth16 proof to separate byte arrays for the Soroban contract.
 * Returns { pi_a: 64 bytes, pi_b: 128 bytes, pi_c: 64 bytes }.
 */
export function serializeProof(proof: Groth16Proof): {
    pi_a: Uint8Array;
    pi_b: Uint8Array;
    pi_c: Uint8Array;
} {
    return serializeProofWithMode(proof, "cap0074");
}

function serializeProofWithMode(
    proof: Groth16Proof,
    g2Mode: G2EncodingMode,
): {
    pi_a: Uint8Array;
    pi_b: Uint8Array;
    pi_c: Uint8Array;
} {
    return {
        pi_a: serializeG1(proof.pi_a),
        pi_b: serializeG2(proof.pi_b, g2Mode),
        pi_c: serializeG1(proof.pi_c),
    };
}

/**
 * Legacy: Convert a Groth16 proof to a flat 256-byte buffer.
 * Kept for compatibility with hashProof().
 */
export function proofToBytes(proof: Groth16Proof): Uint8Array {
    const { pi_a, pi_b, pi_c } = serializeProof(proof);
    const result = new Uint8Array(256);
    result.set(pi_a, 0);
    result.set(pi_b, 64);
    result.set(pi_c, 192);
    return result;
}

// ============================================================================
// On-Chain Contract Integration
// ============================================================================

const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

/**
 * Check if a farmer has already verified their tier on-chain.
 * Uses Soroban RPC simulateTransaction to read contract state.
 */
export async function checkAttestation(farmerAddress: string): Promise<{
    verified: boolean;
    tier?: number;
    timestamp?: number;
    commitment?: string;
}> {
    try {
        const { rpc, Address, Contract, TransactionBuilder, scValToNative } =
            await import("@stellar/stellar-sdk/minimal");
        const { getBestRpcUrl } = await import("../../../utils/rpc");

        const server = new rpc.Server(getBestRpcUrl());
        const contractObj = new Contract(TIER_VERIFIER_CONTRACT_ID);

        // Build read-only call to get_attestation
        const op = contractObj.call(
            "get_attestation",
            new Address(farmerAddress).toScVal(),
        );

        // We need a source account to build the tx for simulation
        const accountResponse = await server.getAccount(farmerAddress).catch(() => null);
        if (!accountResponse) {
            return { verified: false };
        }

        const tx = new TransactionBuilder(accountResponse, {
            fee: "100",
            networkPassphrase: MAINNET_PASSPHRASE,
        })
            .addOperation(op)
            .setTimeout(30)
            .build();

        const sim = await server.simulateTransaction(tx);

        // Check for successful simulation with result
        if (
            rpc.Api.isSimulationSuccess(sim) &&
            sim.result?.retval
        ) {
            const result = scValToNative(sim.result.retval);
            if (!result) return { verified: false };

            if (result.tier !== undefined) {
                return {
                    verified: true,
                    tier: result.tier,
                    timestamp: Number(result.verified_at),
                    commitment: result.commitment
                        ? Array.from(result.commitment as Uint8Array)
                            .map((b: number) => b.toString(16).padStart(2, "0"))
                            .join("")
                        : undefined,
                };
            }
        }

        return { verified: false };
    } catch (e) {
        console.warn("[ZK] Failed to check attestation:", e);
        return { verified: false };
    }
}

/**
 * Submit a Groth16 ZK proof to the tier-verifier contract for on-chain verification.
 *
 * Calls verify_and_attest which performs the full Groth16 pairing check using
 * Protocol 25 BN254 host functions before storing the attestation.
 */
export async function submitProofToContract(
    kit: any, // Backward compatibility, we will use signAndSend internally
    farmerAddress: string,
    tierId: number,
    commitment: Uint8Array,
    proof: Groth16Proof,
    publicSignals?: string[],
    keyId?: string, // New optional argument
    opts?: {
        onStage?: (stage: "simulating" | "assembling" | "signing" | "submitted") => void;
        net?: DungeonNetworkConfig;
    },
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const MAX_RETRIES = 5;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[ZK] Retry attempt ${attempt}/${MAX_RETRIES} for verify_and_attest...`);
                // Progressive backoff: 1s, 2s, 3s, 4s
                const delay = attempt * 1000 + Math.random() * 500;
                await new Promise(r => setTimeout(r, delay));
            }

            return await _submitProofToContractOnce(
                kit, farmerAddress, tierId, commitment, proof, publicSignals, keyId, opts
            );

        } catch (error: any) {
            lastError = error;
            const msg = error.message || JSON.stringify(error);

            // Check for Bad Sequence error (txBadSeq / -5)
            const isBadSeq =
                msg.includes("txBadSeq") ||
                msg.includes("Value: -5") ||
                (error.response?.data?.extras?.result_codes?.transaction === "tx_bad_seq") ||
                (typeof error === 'string' && error.includes("txBadSeq"));

            if (isBadSeq) {
                console.warn(`[ZK] Encountered txBadSeq on verify_and_attest. Retrying...`);
                continue;
            }

            // Return failure immediately for non-retriable errors
            console.error("[ZK] Failed to submit verify_and_attest transaction:", error);
            return {
                success: false,
                error: error.message || "Unknown error",
            };
        }
    }

    // If retries exhausted
    console.error("[ZK] Retry exhausted for verify_and_attest:", lastError);
    return {
        success: false,
        error: lastError?.message || "Transaction failed after retries",
    };
}

/**
 * Internal single-attempt worker for submitProofToContract.
 */
async function _submitProofToContractOnce(
    kit: any,
    farmerAddress: string,
    tierId: number,
    commitment: Uint8Array,
    proof: Groth16Proof,
    publicSignals?: string[],
    keyId?: string,
    opts?: {
        onStage?: (stage: "simulating" | "assembling" | "signing" | "submitted") => void;
        net?: DungeonNetworkConfig;
    },
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const net = opts?.net;
    const contractId = net ? net.tierVerifierContractId : TIER_VERIFIER_CONTRACT_ID;

    console.log("[ZK] Submitting proof to contract for on-chain verification...", {
        contract: contractId,
        network: net?.network ?? "mainnet",
        farmer: farmerAddress,
        tier: tierId,
    });
    console.log("[ZK] DEBUG: Using Contract ID:", contractId);
    validateProofShape(proof);

    if (import.meta.env.DEV && Array.isArray(publicSignals) && publicSignals.length > 0) {
        try {
            const localOk = await verifyProofLocally(proof, publicSignals);
            console.log(`[ZK] Local groth16.verify: ${localOk ? "PASS" : "FAIL"}`);
        } catch (e) {
            console.warn("[ZK] Local groth16.verify failed to run:", e);
        }
    }

    const { Contract, Address, nativeToScVal, xdr, TransactionBuilder, rpc, Account, Networks } = await import("@stellar/stellar-sdk/minimal");
    const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

    const contractObj = new Contract(contractId);

    const buildProofStruct = (serialized: {
        pi_a: Uint8Array;
        pi_b: Uint8Array;
        pi_c: Uint8Array;
    }) =>
        xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol("pi_a"),
                val: nativeToScVal(Buffer.from(serialized.pi_a), { type: "bytes" }),
            }),
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol("pi_b"),
                val: nativeToScVal(Buffer.from(serialized.pi_b), { type: "bytes" }),
            }),
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol("pi_c"),
                val: nativeToScVal(Buffer.from(serialized.pi_c), { type: "bytes" }),
            }),
        ]);

    const networkPassphrase = net ? net.networkPassphrase : Networks.PUBLIC;

    const buildTx = async (proofStruct: any) => {
        const op = contractObj.call(
            "verify_and_attest",
            new Address(farmerAddress).toScVal(),
            nativeToScVal(tierId, { type: "u32" }),
            nativeToScVal(Buffer.from(commitment), { type: "bytes" }),
            proofStruct,
        );

        let sourceAccount: InstanceType<typeof Account>;

        if (net) {
            // For testnet/freighter, we MUST use the real account as source
            // so that require_auth works and fees are paid by the user.
            try {
                // We reuse the server instance created below
                sourceAccount = await server.getAccount(farmerAddress);
            } catch (e) {
                console.warn("[ZK] Could not fetch account info, falling back to 0 sequence (might fail):", e);
                sourceAccount = new Account(farmerAddress, "0");
            }
        } else {
            // For passkey kit, we use NULL_ACCOUNT as the kit handles the inner tx
            sourceAccount = new Account(NULL_ACCOUNT, "0");
        }

        return new TransactionBuilder(sourceAccount, {
            fee: "10000000", // 1 XLM max
            networkPassphrase,
        })
            .addOperation(op)
            .setTimeout(300)
            .build();
    };

    const capProof = serializeProofWithMode(proof, "cap0074");
    const legacyProof = serializeProofWithMode(proof, "legacy");

    let rpcUrl: string;
    if (net) {
        rpcUrl = net.rpcUrl;
    } else {
        const { getBestRpcUrl } = await import("../../../utils/rpc");
        rpcUrl = getBestRpcUrl();
    }
    const server = new rpc.Server(rpcUrl);

    const simulateMode = async (mode: G2EncodingMode) => {
        opts?.onStage?.("simulating");
        const serialized = mode === "cap0074" ? capProof : legacyProof;
        const nextTx = await buildTx(buildProofStruct(serialized));
        const nextSim = await server.simulateTransaction(nextTx);
        return { mode, tx: nextTx, sim: nextSim };
    };

    // CAP-0074 vs legacy limb ordering varies between toolchains/emitters.
    // We try cap0074 first, and if it fails we also try legacy. This prevents
    // "InvalidProof" failures caused purely by G2 limb order when the point still
    // decodes as on-curve.
    let { mode: selectedMode, tx, sim } = await simulateMode("cap0074");

    if (!rpc.Api.isSimulationSuccess(sim)) {
        const primary = summarizeFailure(sim);
        console.warn(`[ZK] cap0074 simulation failed (${primary}). Trying legacy G2 encoding...`);
        const legacyAttempt = await simulateMode("legacy");
        if (rpc.Api.isSimulationSuccess(legacyAttempt.sim)) {
            selectedMode = legacyAttempt.mode;
            tx = legacyAttempt.tx;
            sim = legacyAttempt.sim;
        } else {
            const secondary = summarizeFailure(legacyAttempt.sim);
            throw new Error(
                `Simulation failed for verify_and_attest (cap0074): ${primary} | (legacy): ${secondary}`,
            );
        }
    }

    if (!rpc.Api.isSimulationSuccess(sim)) {
        console.error("[ZK] Simulation FAILED. Detailed dump:", JSON.stringify(sim, null, 2));

        // Log the args we tried to use
        console.log("[ZK] Args used:", {
            farmer: farmerAddress,
            tierId,
            commitment: Buffer.from(commitment).toString('hex'),
            proofMode: selectedMode,
        });

        // Check if we have auth entries anyway (sometimes they exist even on failure)
        // @ts-ignore
        if (sim.result && sim.result.auth) {
            // @ts-ignore
            console.log("[ZK] Simulation Auth Entries (on failure):", JSON.stringify(sim.result.auth, null, 2));
        }

        throw new Error("Simulation failed for verify_and_attest: " + summarizeFailure(sim));
    }

    console.log(`[ZK] Simulation succeeded using ${selectedMode} G2 encoding.`);
    if (sim.result && sim.result.auth) {
        console.log("[ZK] Simulation Auth Entries:", JSON.stringify(sim.result.auth, null, 2));
    } else {
        console.warn("[ZK] Simulation returned NO auth entries (unexpected for require_auth call)");
    }

    // Prepare transaction with simulation data
    opts?.onStage?.("assembling");
    const preparedTx = rpc.assembleTransaction(tx, sim).build();

    opts?.onStage?.("signing");

    let txHash: string;
    if (net) {
        // Network-aware path (hackathon testnet).
        txHash = await net.signAndSubmit(preparedTx, { keyId, contractId: farmerAddress });
    } else {
        // Legacy mainnet passkey path.
        const { signAndSend } = await import("../../../utils/transaction-helpers");
        const result = await signAndSend(preparedTx, {
            keyId: keyId || kit?.wallet?.keyId || "",
            contractId: farmerAddress,
            turnstileToken: "",
            updateBalance: true,
        });

        if (!result.success) {
            throw new Error(result.error || "On-chain verification failed");
        }

        const { extractTxHashFromRelayerResponse } = await import("../../../utils/transaction-helpers");
        txHash =
            result.transactionHash ||
            extractTxHashFromRelayerResponse(result.result) ||
            extractTxHashFromRelayerResponse(result);

        if (!txHash) {
            throw new Error(`Verification succeeded but no transaction hash was returned.`);
        }
    }

    opts?.onStage?.("submitted");
    return {
        success: true,
        txHash,
    };
}

// ============================================================================
// Internal Simulation Error Handling
// ============================================================================

function collectFailureStrings(
    value: unknown,
    out: Set<string>,
    seen: Set<unknown>,
    depth = 0,
): void {
    if (value === null || value === undefined || depth > 8) return;
    if (typeof value === "string") {
        const text = value.trim();
        if (!text) return;
        out.add(text.length > 512 ? `${text.slice(0, 512)}...` : text);
        return;
    }
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
        for (const item of value.slice(0, 40)) {
            collectFailureStrings(item, out, seen, depth + 1);
        }
        return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === "event" && typeof child === "string") continue;
        collectFailureStrings(child, out, seen, depth + 1);
    }
}

function extractFailureText(sim: unknown): string {
    const parts = new Set<string>();
    collectFailureStrings(sim, parts, new Set<unknown>());
    if (parts.size > 0) return Array.from(parts).join("\n");
    try {
        return JSON.stringify(sim);
    } catch {
        return String(sim);
    }
}

const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
    1: "Super Verifier returned Contract #1 (InvalidProof): proof/public inputs do not match the on-chain verification key.",
    2: "Super Verifier returned Contract #2 (InvalidTier): tier must be between 0 and 3.",
    3: "Super Verifier returned Contract #3 (NotAdmin): caller is not admin for this method.",
    4: "Super Verifier returned Contract #4 (AlreadyInitialized).",
    5: "Super Verifier returned Contract #5 (NotInitialized): verification key/admin are not initialized on-chain.",
    6: "Super Verifier returned Contract #6 (InvalidPublicInputs): verifier key IC length does not match expected public input count.",
};

function classifyFailure(
    sim: unknown,
): {
    kind: "g2_curve" | "crypto_invalid_input" | "contract_error" | "unknown";
    raw: string;
    contractCode?: number;
} {
    const raw = extractFailureText(sim);
    if (raw.includes("bn254 G2: point not on curve")) {
        return { kind: "g2_curve", raw };
    }
    if (
        raw.includes("HostError: Error(Crypto, InvalidInput)") ||
        raw.includes("Error(Crypto, InvalidInput)")
    ) {
        return { kind: "crypto_invalid_input", raw };
    }

    const contractErrorMatch = raw.match(/Error\(Contract,\s*#(\d+)\)/);
    if (contractErrorMatch) {
        return {
            kind: "contract_error",
            raw,
            contractCode: Number(contractErrorMatch[1]),
        };
    }

    return { kind: "unknown", raw };
}

function summarizeFailure(sim: unknown): string {
    const failure = classifyFailure(sim);
    if (failure.kind === "g2_curve") {
        return "bn254 G2 point decode failed on-chain (likely verification-key encoding mismatch).";
    }
    if (failure.kind === "crypto_invalid_input") {
        return "on-chain BN254 host validation failed with Crypto.InvalidInput.";
    }
    if (
        failure.kind === "contract_error" &&
        typeof failure.contractCode === "number"
    ) {
        return (
            CONTRACT_ERROR_MESSAGES[failure.contractCode] ||
            `Super Verifier returned Contract #${failure.contractCode}.`
        );
    }
    const normalized = failure.raw.replace(/\s+/g, " ").trim();
    return normalized.length > 320
        ? `${normalized.slice(0, 320)}...`
        : normalized;
}

function hasG2CurveError(sim: unknown): boolean {
    return classifyFailure(sim).kind === "g2_curve";
}

/**
 * Hash a proof to a 32-byte value for on-chain storage.
 */
export async function hashProof(proof: Groth16Proof): Promise<Uint8Array> {
    const proofBytes = proofToBytes(proof);
    const buffer = proofBytes.buffer.slice(
        proofBytes.byteOffset,
        proofBytes.byteOffset + proofBytes.byteLength,
    ) as ArrayBuffer;
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return new Uint8Array(hashBuffer);
}
