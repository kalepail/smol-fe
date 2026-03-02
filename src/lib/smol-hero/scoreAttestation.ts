/**
 * Smol Hero: On-Chain Score Attestation via Stellar / Soroban.
 *
 * Records a player's score as an attestation on the Farm Attestations contract.
 * Follows the same tx pipeline as dungeon stamps but uses system="HERO".
 *
 * Attestation format:
 *   system  = "HERO"
 *   tier    = "STAR_0" .. "STAR_5" | "GOLDEN"
 *   statement = sha256(JSON{ trackId, score, stars, golden, difficulty, ... })
 *   verifier  = sha256(trackId)   (identifies the song)
 */

import {
    Account,
    Address,
    Contract,
    Networks,
    TransactionBuilder,
    TimeoutInfinite,
    rpc,
    xdr,
} from "@stellar/stellar-sdk/minimal";
import { Buffer } from "buffer";
import {
    FARM_ATTESTATIONS_CONTRACT_ID_MAINNET,
    MAINNET_NETWORK_PASSPHRASE,
    MAINNET_RPC_URL,
} from "../../config/farmAttestation";
import {
    ensureBytes32Hex,
    hexToBytes,
    sha256Hex,
    sha256HexOfJson,
} from "../the-farm/digest";
import { getRpcUrl } from "../../utils/rpc";

const { Api, Server, assembleTransaction } = rpc;
const NULL_ACCOUNT =
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ── Types ────────────────────────────────────────────────────────────────────

export interface HeroScorePayload {
    trackId: string;
    trackTitle: string;
    score: number;
    stars: number;
    golden: boolean;
    difficulty: string;
    accuracy: number;
    maxCombo: number;
    perfect: number;
    great: number;
    ok: number;
    miss: number;
}

export type AttestStage =
    | "preparing"
    | "simulating"
    | "assembling"
    | "signing"
    | "submitted"
    | "confirmed";

export type HeroAttestResult =
    | { ok: true; txHash: string; ledger?: number }
    | { ok: false; error: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function symbol(value: string): xdr.ScVal {
    return xdr.ScVal.scvSymbol(value);
}

function resolveSorobanRpcUrl(): string {
    const fromEnv = MAINNET_RPC_URL.trim();
    if (fromEnv) return fromEnv;
    try {
        const selected = (getRpcUrl?.() ?? "").trim();
        if (selected) return selected;
    } catch {
        /* ignore */
    }
    const fallback = (import.meta.env.PUBLIC_RPC_URL ?? "").trim();
    if (fallback) return fallback;
    return "";
}

async function waitInterval(ms: number): Promise<void> {
    await new Promise<void>((r) => setTimeout(r, ms));
}

async function waitForTransaction(
    server: rpc.Server,
    hash: string,
): Promise<rpc.Api.GetTransactionResponse> {
    for (let attempt = 0; attempt < 50; attempt++) {
        const tx = await server.getTransaction(hash);
        if (
            tx.status === Api.GetTransactionStatus.SUCCESS ||
            tx.status === Api.GetTransactionStatus.FAILED
        ) {
            return tx;
        }
        await waitInterval(1200);
    }
    throw new Error("Hero score attestation confirmation timed out");
}

/**
 * Build deterministic digests for a score attestation.
 */
export async function buildScoreDigests(payload: HeroScorePayload) {
    const statementHash = await sha256HexOfJson({
        system: "HERO",
        trackId: payload.trackId,
        score: payload.score,
        stars: payload.stars,
        golden: payload.golden,
        difficulty: payload.difficulty,
        accuracy: payload.accuracy,
        maxCombo: payload.maxCombo,
        perfect: payload.perfect,
        great: payload.great,
        ok: payload.ok,
        miss: payload.miss,
    });

    const verifierHash = await sha256Hex(payload.trackId);

    return { statementHash, verifierHash };
}

/**
 * Map star count to the Soroban symbol used as the attestation tier.
 */
function tierFromStars(stars: number, golden: boolean): string {
    if (golden) return "GOLDEN";
    return `STAR_${Math.min(5, Math.max(0, stars))}`;
}

// ── Main Attestation Function ────────────────────────────────────────────────

/**
 * Publish a Smol Hero score attestation to the Farm Attestations contract.
 *
 * Tx pipeline: prepare digests -> simulate -> assemble -> passkey sign -> submit -> confirm.
 */
export async function attestHeroScore(input: {
    owner: string; // passkey smart account contractId
    keyId: string; // passkey keyId (base64)
    payload: HeroScorePayload;
    onStage?: (stage: AttestStage) => void;
}): Promise<HeroAttestResult> {
    try {
        input.onStage?.("preparing");

        const { statementHash, verifierHash } = await buildScoreDigests(
            input.payload,
        );
        const tier = tierFromStars(
            input.payload.stars,
            input.payload.golden,
        );

        const contractId = FARM_ATTESTATIONS_CONTRACT_ID_MAINNET.trim();
        if (!contractId) {
            throw new Error(
                "Farm Attestations contract not configured. Set PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET.",
            );
        }

        const rpcUrl = resolveSorobanRpcUrl();
        if (!rpcUrl) {
            throw new Error(
                "Soroban RPC URL not configured. Set PUBLIC_RPC_URL.",
            );
        }

        const passphrase =
            MAINNET_NETWORK_PASSPHRASE || Networks.PUBLIC;

        const server = new Server(rpcUrl);
        const contract = new Contract(contractId);
        const sourceAccount = new Account(NULL_ACCOUNT, "0");

        // Build the contract call: attest_if_best(owner, "HERO", tier, statement, verifier, score)
        // Personal-best enforcement: only writes on-chain if score > existing.
        const operation = contract.call(
            "attest_if_best",
            new Address(input.owner).toScVal(),
            symbol("HERO"),
            symbol(tier),
            xdr.ScVal.scvBytes(
                Buffer.from(hexToBytes(ensureBytes32Hex(statementHash))),
            ),
            xdr.ScVal.scvBytes(
                Buffer.from(hexToBytes(ensureBytes32Hex(verifierHash))),
            ),
            xdr.ScVal.scvU64(xdr.Uint64.fromString(String(input.payload.score))),
        );

        const tx = new TransactionBuilder(sourceAccount, {
            fee: "10000000",
            networkPassphrase: passphrase,
        })
            .addOperation(operation)
            .setTimeout(TimeoutInfinite)
            .build();

        input.onStage?.("simulating");
        const sim = await server.simulateTransaction(tx);
        if (Api.isSimulationError(sim)) {
            throw new Error(`Simulation failed: ${sim.error}`);
        }

        input.onStage?.("assembling");
        const preparedTx = assembleTransaction(tx, sim).build();

        input.onStage?.("signing");
        const { signAndSend } = await import(
            "../../utils/transaction-helpers"
        );
        const result = await signAndSend(preparedTx, {
            keyId: input.keyId,
            contractId: input.owner,
            turnstileToken: "",
            updateBalance: true,
        });

        if (!result.success) {
            throw new Error(result.error || "Score attestation signing failed");
        }

        const { extractTxHashFromRelayerResponse } = await import(
            "../../utils/transaction-helpers"
        );
        const txHash =
            result.transactionHash ||
            extractTxHashFromRelayerResponse(result.result) ||
            extractTxHashFromRelayerResponse(result);
        if (!txHash) {
            throw new Error(
                `Relayer success but no tx hash: ${JSON.stringify(result.result)}`,
            );
        }

        input.onStage?.("submitted");
        const confirmed = await waitForTransaction(server, txHash);
        if (confirmed.status !== Api.GetTransactionStatus.SUCCESS) {
            return {
                ok: false,
                error: "Score attestation transaction failed on-chain",
            };
        }

        input.onStage?.("confirmed");
        return { ok: true, txHash, ledger: confirmed.ledger };
    } catch (e) {
        return {
            ok: false,
            error:
                e instanceof Error
                    ? e.message
                    : "Score attestation failed",
        };
    }
}
