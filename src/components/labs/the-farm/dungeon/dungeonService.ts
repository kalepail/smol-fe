/**
 * Dungeon Service — Local ZK proof generation plumbing for ZK Dungeon.
 *
 * What is real in this file:
 * - Door attempt proof generation via Circom Groth16 (snarkjs) + local verification.
 *
 * What is NOT wired in this repo pass:
 * - On-chain submission / verification for dungeon attempts.
 * - Any "hub" contract calls are experimental and currently unused by the UI.
 */

import {
    Contract,
    Address,
    nativeToScVal,
    TransactionBuilder,
    Networks,
    Account,
    rpc,
} from "@stellar/stellar-sdk/minimal";

import { evaluateDoorAttempt } from "../../../../lib/dungeon/evaluateDoorAttempt";
import { getFloorDefinition } from "../../../../lib/dungeon/policies";
import { verifyCredential } from "../../../../lib/dungeon/verifyCredential";
import type { VerifierType } from "../../../../lib/dungeon/verifyCredential";

const { Server, Api, assembleTransaction } = rpc;

// ── Constants ────────────────────────────────────────────────────────────────

/** Game hub contract on Stellar testnet */
export const HUB_CONTRACT_ID =
    "CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG";

/** Testnet RPC endpoint */
const TESTNET_RPC = "https://soroban-testnet.stellar.org";

/** Null account for building unsigned transactions (passkey signs later) */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const TESTNET_PASSPHRASE = Networks.TESTNET;

// ── Testnet RPC Server ───────────────────────────────────────────────────────

let _server: InstanceType<typeof Server> | null = null;
function getTestnetServer(): InstanceType<typeof Server> {
    if (!_server) {
        _server = new Server(TESTNET_RPC);
    }
    return _server;
}

// ── Transaction Builder Helpers ──────────────────────────────────────────────

interface BuildResult {
    assembled: any; // Transaction ready for signing
    simResult: any;
}

/**
 * Build + simulate a Soroban contract call on testnet.
 * Returns the assembled transaction ready for passkey signing.
 */
async function buildAndSimulate(
    contractId: string,
    method: string,
    args: any[],
): Promise<BuildResult> {
    const contract = new Contract(contractId);
    const op = contract.call(method, ...args);

    const sourceAccount = new Account(NULL_ACCOUNT, "0");
    const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000000", // 1 XLM max
        networkPassphrase: TESTNET_PASSPHRASE,
    })
        .addOperation(op)
        .setTimeout(300)
        .build();

    const server = getTestnetServer();
    const simResult = await server.simulateTransaction(tx);

    if (Api.isSimulationError(simResult)) {
        const errMsg =
            typeof simResult.error === "string"
                ? simResult.error
                : JSON.stringify(simResult.error);
        throw new Error(`Simulation failed: ${errMsg}`);
    }

    const assembled = assembleTransaction(tx, simResult).build();
    return { assembled, simResult };
}

/**
 * Sign and send a testnet transaction via passkey-kit.
 * Returns the transaction hash on success.
 */
async function signAndSendTestnet(
    assembled: any,
    keyId: string,
    contractId: string,
): Promise<string> {
    // Dynamic imports to avoid bundling heavy deps at module level
    const { account, send } = await import("../../../../utils/passkey-kit");
    const { getLatestSequence } = await import("../../../../utils/base");
    const { getSafeRpId } = await import("../../../../utils/domains");

    const kit = await account.get();
    const rpId = getSafeRpId(window.location.hostname);
    const sequence = await getLatestSequence();

    // Ensure wallet is connected
    if (!kit.wallet) {
        await kit.connectWallet({
            rpId,
            keyId,
            getContractId: async () => contractId,
        });
    }

    const signedTx = await kit.sign(assembled, {
        rpId,
        keyId,
        expiration: sequence + 60,
    });

    // Use empty turnstile token — testnet relayer may not require it
    const result = await send(signedTx, "");
    return result.hash || result.transactionHash || "";
}

// ── Hub Contract Calls ───────────────────────────────────────────────────────

export interface StartGameParams {
    gameId: string;       // Game contract address (our dungeon contract)
    sessionId: number;    // Lobby session ID (u32)
    player1: string;      // Player 1 Stellar address
    player2: string;      // Player 2 Stellar address
    player1Points: bigint;
    player2Points: bigint;
    keyId: string;
    contractId: string;   // Wallet contract ID (for passkey signing)
}

/**
 * Call start_game() on the game hub contract.
 * This registers the game session with the hub.
 */
export async function callStartGame(params: StartGameParams): Promise<string> {
    console.log("[Dungeon] start_game() →", params.sessionId);

    const args = [
        new Address(params.gameId).toScVal(),
        nativeToScVal(params.sessionId, { type: "u32" }),
        new Address(params.player1).toScVal(),
        new Address(params.player2).toScVal(),
        nativeToScVal(params.player1Points, { type: "i128" }),
        nativeToScVal(params.player2Points, { type: "i128" }),
    ];

    const { assembled } = await buildAndSimulate(HUB_CONTRACT_ID, "start_game", args);
    const txHash = await signAndSendTestnet(assembled, params.keyId, params.contractId);

    console.log("[Dungeon] start_game() tx:", txHash);
    return txHash;
}

export interface EndGameParams {
    sessionId: number;
    player1Won: boolean;
    keyId: string;
    contractId: string;
}

/**
 * Call end_game() on the game hub contract.
 * This finalizes the game session with the hub.
 */
export async function callEndGame(params: EndGameParams): Promise<string> {
    console.log("[Dungeon] end_game() →", params.sessionId);

    const args = [
        nativeToScVal(params.sessionId, { type: "u32" }),
        nativeToScVal(params.player1Won, { type: "bool" }),
    ];

    const { assembled } = await buildAndSimulate(HUB_CONTRACT_ID, "end_game", args);
    const txHash = await signAndSendTestnet(assembled, params.keyId, params.contractId);

    console.log("[Dungeon] end_game() tx:", txHash);
    return txHash;
}

// ── Door Attempt (Real ZK Proof) ─────────────────────────────────────────────

export interface DoorAttemptParams {
    lobbyId: string;
    floor: number;
    doorChoice: number;
    attemptNonce: number;
    playerAddress: string;
    keyId: string;
    contractId: string;
    policySeed: string;
    tierId: number;
    balance: bigint;
    mode: "normal" | "training";
    lobbyState: { enabled: boolean; waiting: boolean; reason?: string };
    /**
     * Optional: what the player claims to present at the door (used to teach that
     * different rooms accept different credential formats).
     *
     * If omitted, defaults to the room's expected verifierType.
     */
    presentedVerifierType?: VerifierType;
}

export interface DoorAttemptResult {
    accepted: boolean;
    reasonCode: string;
    reasonHuman: string;
    forensics: {
        policyName: string;
        policyRule: string;
        doorRequirement: string;
        yourCredentialSummary: string;
        mismatchExplanation: string;
        nextAction: string;
    };
    debug?: {
        tierId: number;
        parity: "EVEN" | "ODD";
        comparisons: string[];
    };
    tierId: number;
    proofOk: boolean;
    txHash: string | null;
    proofType: string;
    verifierType: string;
    trainingOnly?: boolean;
    groth16?: {
        proof: any;
        publicSignals: string[];
        commitmentBytes: Uint8Array;
    };
    commitment: string | null;
    provingTimeMs: number;
    error: string | null;
}

/**
 * Submit a door attempt with a real ZK proof.
 *
 * Flow:
 * 1. Generate Groth16 proof via snarkjs (Poseidon commitment, real BN254)
 * 2. Verify locally (debug check)
 * 3. Return structured result
 *
 * NOTE: Wrong choices still generate valid proofs. The `is_correct` flag
 * is determined by comparing the chosen door against the correct door.
 * The proof itself always verifies — only the outcome differs.
 */
export async function attemptDoor(
    params: DoorAttemptParams,
): Promise<DoorAttemptResult> {
    console.log("[Dungeon] attemptDoor →", {
        floor: params.floor,
        door: params.doorChoice,
        nonce: params.attemptNonce,
    });

    const proofType = getProofTypeForFloor(params.floor);

    try {
        const floorDef = getFloorDefinition(params.floor, { seed: params.policySeed || "demo", tierId: params.tierId });

        let proofOk = false;
        let tierId = params.tierId;
        let commitment: string | null = null;
        let provingTimeMs = 0;
        let trainingOnly = false;
        const expectedVerifierType = floorDef.verifierType;
        const verifierType: VerifierType = (params.presentedVerifierType ?? expectedVerifierType) as VerifierType;
        let proofTypeLabel = proofType;
        let groth16Bundle: DoorAttemptResult["groth16"] | undefined;

        if (verifierType === "GROTH16") {
            // Generate real Groth16 proof (per attempt)
            const { generateDoorProof, verifyDoorProofLocally } = await import("./dungeonProofWorker");

            const proofResult = await generateDoorProof({
                playerAddress: params.playerAddress || params.contractId || "anonymous",
                floor: params.floor,
                doorChoice: params.doorChoice,
                attemptNonce: params.attemptNonce,
                lobbyId: params.lobbyId,
                tierId: params.tierId,
                balance: params.balance ?? 0n,
            });

            commitment = proofResult.commitment;
            provingTimeMs = proofResult.provingTimeMs;
            proofTypeLabel = proofResult.proofType;
            groth16Bundle = {
                proof: proofResult.proof,
                publicSignals: proofResult.publicSignals,
                commitmentBytes: proofResult.commitmentBytes,
            };

            // Verify locally (required integrity check)
            try {
                proofOk = await verifyDoorProofLocally(proofResult.proof, proofResult.publicSignals);
                console.log("[Dungeon] Local verification:", proofOk ? "PASS" : "FAIL");
            } catch (verifyErr) {
                console.warn("[Dungeon] Local verification error:", verifyErr);
                proofOk = false;
            }

            // Prefer tierId from public signals (binds credential summary to the proof).
            const tierSignal =
                Array.isArray(proofResult.publicSignals)
                    ? proofResult.publicSignals.find((s) => s === String(params.tierId)) ?? proofResult.publicSignals[0]
                    : String(params.tierId);
            const provenTierId = Number.parseInt(String(tierSignal), 10);
            tierId = Number.isFinite(provenTierId) ? provenTierId : params.tierId;
        } else {
            // Noir / RISC0: verify a training credential artifact (cryptographically real verifier),
            // selected by tierId. This is explicitly labeled as training-only in the UI.
            const cred = await verifyCredential({ verifierType, tierId: params.tierId });
            proofOk = cred.ok;
            tierId = cred.tierId;
            provingTimeMs = cred.durationMs;
            trainingOnly = cred.trainingOnly;

            if (verifierType === "NOIR_ULTRAHONK") {
                proofTypeLabel = "UltraHonk (Noir)";
                if (import.meta.env.DEV) {
                    console.debug(`[Dungeon] Noir verifier ${proofOk ? "PASS" : "FAIL"} (${provingTimeMs}ms)`);
                }
            } else if (verifierType === "RISC0_RECEIPT") {
                proofTypeLabel = "RISC0 Receipt (zkVM)";
                if (import.meta.env.DEV) {
                    console.debug(`[Dungeon] RISC0 verifier ${proofOk ? "PASS" : "FAIL"} (${provingTimeMs}ms)`);
                }
            }
        }

        const outcome = evaluateDoorAttempt({
            floor: params.floor,
            doorId: params.doorChoice as any,
            policySeed: params.policySeed || "demo",
            proofOk,
            provenInputs: { tierId },
            lobbyState: params.lobbyState.enabled
                ? { enabled: true, waiting: params.lobbyState.waiting, reason: params.lobbyState.reason }
                : { enabled: false },
            mode: params.mode,
            expectedVerifierType,
            presentedVerifierType: verifierType,
        });

            return {
                accepted: outcome.accepted,
                reasonCode: outcome.reasonCode,
                reasonHuman: outcome.reasonHuman,
                forensics: outcome.forensics,
                debug: outcome.debug,
                tierId,
                proofOk,
                txHash: null, // On-chain submission in next iteration
                proofType: proofTypeLabel,
                verifierType,
                trainingOnly,
                groth16: groth16Bundle,
                commitment,
                provingTimeMs,
                error: null,
            };
    } catch (err: any) {
        const msg = String(err?.message || err);
        console.error("[Dungeon] Proof generation failed:", msg);

        const floorDef = getFloorDefinition(params.floor, { seed: params.policySeed || "demo", tierId: params.tierId });
        const isViteDepIssue =
            msg.includes("Outdated Optimize Dep") ||
            msg.includes("Failed to fetch dynamically imported module") ||
            msg.includes("net::ERR_ABORTED");

        return {
            accepted: false,
            reasonCode: "ERROR",
            reasonHuman: isViteDepIssue ? "Toolchain loading hiccup (dev server). Retry." : "Internal error",
            forensics: {
                policyName: floorDef.policyName,
                policyRule: floorDef.briefing,
                doorRequirement: `Door ${params.doorChoice}`,
                yourCredentialSummary: `Tier ${params.tierId}`,
                mismatchExplanation: isViteDepIssue
                    ? "Dev server was still optimizing ZK dependencies (Vite 504). Try again; it should stabilize after the first load."
                    : msg,
                nextAction: isViteDepIssue ? "Click again (or refresh once), then retry." : "Retry.",
            },
            tierId: params.tierId,
            proofOk: false,
            txHash: null,
            proofType,
            verifierType: floorDef.verifierType,
            commitment: null,
            provingTimeMs: 0,
            error: msg,
        };
    }
}

// ── Utility ──────────────────────────────────────────────────────────────────

/** Map floor number to proof framework label */
export function getProofTypeForFloor(floor: number): string {
    // Historically, floors were all Groth16. The room can override with Noir/RISC0 in attemptDoor.
    return "Groth16 (Circom)";
}

/** Generate a random session ID (u32) */
export function generateSessionId(): number {
    return Math.floor(Math.random() * 0x7fffffff);
}

/** Stellar expert testnet tx link */
export function txExplorerUrl(txHash: string): string {
    return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

/** Stellar expert testnet contract link */
export function contractExplorerUrl(contractId: string): string {
    return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
}
