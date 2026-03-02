/**
 * Network-aware configuration for dungeon contract calls.
 *
 * In hackathon mode the game routes ZK verification transactions to Stellar
 * Testnet (signed via Freighter/SWK) instead of mainnet (passkey-kit).
 */

import { Networks } from "@stellar/stellar-sdk/minimal";
import {
    FARM_ATTESTATIONS_CONTRACT_ID_MAINNET,
    FARM_ATTESTATIONS_CONTRACT_ID_TESTNET,
    MAINNET_NETWORK_PASSPHRASE,
    MAINNET_RPC_URL,
    TESTNET_NETWORK_PASSPHRASE,
    TESTNET_RPC_URL,
} from "../../config/farmAttestation";
import { RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET, RISC0_GROTH16_VERIFIER_CONTRACT_ID_TESTNET } from "../../config/risc0Groth16Verifier";
import { TIER_VERIFIER_CONTRACT_ID, TIER_VERIFIER_CONTRACT_ID_TESTNET } from "../../components/labs/the-farm/zkTypes";
import { getRpcUrl } from "../../utils/rpc";

// ── Shared type ─────────────────────────────────────────────────────────────

export interface DungeonNetworkConfig {
    network: "mainnet" | "testnet";
    rpcUrl: string;
    networkPassphrase: string;
    farmAttestationsContractId: string;
    tierVerifierContractId: string;
    risc0Groth16VerifierContractId: string;
    /**
     * Sign and submit a prepared (assembled) Soroban transaction.
     * Returns the confirmed tx hash.
     *
     * For mainnet this delegates to passkey-kit `signAndSend`.
     * For testnet this delegates to SWK `signAndSubmitSwk`.
     */
    signAndSubmit: (assembled: any, opts: { keyId?: string; contractId?: string }) => Promise<string>;
}

// ── Mainnet config ──────────────────────────────────────────────────────────

function resolveMainnetRpcUrl(): string {
    const fromEnv = MAINNET_RPC_URL.trim();
    if (fromEnv) return fromEnv;

    try {
        const selected = (getRpcUrl?.() ?? "").trim();
        if (selected) return selected;
    } catch {
        // Ignore selector errors.
    }

    const fallback = (import.meta.env.PUBLIC_RPC_URL ?? "").trim();
    if (fallback) return fallback;

    return "";
}

/**
 * Build the mainnet network config.
 * `keyId` and `contractId` are needed for passkey signing.
 */
export function mainnetConfig(): DungeonNetworkConfig {
    return {
        network: "mainnet",
        rpcUrl: resolveMainnetRpcUrl(),
        networkPassphrase: MAINNET_NETWORK_PASSPHRASE || Networks.PUBLIC,
        farmAttestationsContractId: FARM_ATTESTATIONS_CONTRACT_ID_MAINNET,
        tierVerifierContractId: TIER_VERIFIER_CONTRACT_ID,
        risc0Groth16VerifierContractId: RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET,
        signAndSubmit: async (assembled, opts) => {
            const { signAndSend } = await import("../../utils/transaction-helpers");
            const result = await signAndSend(assembled, {
                keyId: opts.keyId || "",
                contractId: opts.contractId || "",
                turnstileToken: "",
                updateBalance: true,
            });

            if (!result.success) {
                throw new Error(result.error || "Mainnet signing/submission failed");
            }

            const { extractTxHashFromRelayerResponse } = await import("../../utils/transaction-helpers");
            const txHash =
                result.transactionHash ||
                extractTxHashFromRelayerResponse(result.result) ||
                extractTxHashFromRelayerResponse(result);
            if (!txHash) {
                throw new Error(`Relayer success but no hash discovered in result: ${JSON.stringify(result.result)}`);
            }
            return txHash;
        },
    };
}

/**
 * Build the testnet network config (hackathon mode).
 * Signing is handled by the SWK (Freighter) wallet flow in dungeonTestnetWallet.
 */
export function testnetConfig(): DungeonNetworkConfig {
    return {
        network: "testnet",
        rpcUrl: TESTNET_RPC_URL,
        networkPassphrase: TESTNET_NETWORK_PASSPHRASE || Networks.TESTNET,
        farmAttestationsContractId: FARM_ATTESTATIONS_CONTRACT_ID_TESTNET,
        tierVerifierContractId: TIER_VERIFIER_CONTRACT_ID_TESTNET,
        risc0Groth16VerifierContractId: RISC0_GROTH16_VERIFIER_CONTRACT_ID_TESTNET,
        signAndSubmit: async (assembled) => {
            const { signAndSubmitSwk } = await import("../../components/labs/the-farm/dungeon/dungeonTestnetWallet");
            return signAndSubmitSwk(assembled);
        },
    };
}
