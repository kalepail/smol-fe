import { Account, Address, Contract, Networks, StrKey, TransactionBuilder, TimeoutInfinite, rpc, xdr } from "@stellar/stellar-sdk/minimal";
import { Buffer } from "buffer";
import { FARM_ATTESTATIONS_CONTRACT_ID_MAINNET, MAINNET_NETWORK_PASSPHRASE, MAINNET_RPC_URL } from "../../config/farmAttestation";
import { ensureBytes32Hex, hexToBytes } from "../the-farm/digest";
import { getRpcUrl } from "../../utils/rpc";
import { noirUltraHonkLegacySamples, noirUltraHonkLegacyVkDigestHex } from "../../data/dungeon/noirUltraHonkLegacyBundle";
import type { DungeonNetworkConfig } from "./networkConfig";

const { Api, Server, assembleTransaction } = rpc;
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// Keep <= 32 chars for Soroban Symbol.
const DEFAULT_NOIR_ULTRAHONK_VK_ID = "NOIR_TIER_V1";

export type NoirUltraHonkOnchainResult =
  | { ok: true; txHash: string; ledger?: number }
  | { ok: false; error: string; txHash?: string };

function resolveSorobanRpcUrl(): string {
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

function symbol(value: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(value);
}

async function waitInterval(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const handle = globalThis.setInterval(() => {
      globalThis.clearInterval(handle);
      resolve();
    }, milliseconds);
  });
}

async function waitForTransaction(server: rpc.Server, hash: string): Promise<rpc.Api.GetTransactionResponse> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const tx = await server.getTransaction(hash);
    if (tx.status === Api.GetTransactionStatus.SUCCESS || tx.status === Api.GetTransactionStatus.FAILED) {
      return tx;
    }
    await waitInterval(1200);
  }
  throw new Error("Noir UltraHonk on-chain verification confirmation timed out");
}

function tierIdToSampleTier(tierId: number): "sprout" | "grower" | "harvester" | "whale" {
  if (tierId <= 0) return "sprout";
  if (tierId === 1) return "grower";
  if (tierId === 2) return "harvester";
  return "whale";
}

function concatPublicInputsBytes(publicInputsHex: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const hex of publicInputsHex) {
    parts.push(Buffer.from(hexToBytes(ensureBytes32Hex(hex))));
  }
  return Buffer.concat(parts);
}

/**
 * On-chain proof verification for Noir UltraHonk proofs.
 *
 * When `net` is provided the call routes to that network (testnet for hackathon mode).
 */
export async function publishNoirUltraHonkVerifyMainnet(input: {
  owner: string;
  keyId: string;
  tierId: number;
  proofOverride?: { proofBase64: string; publicInputs: string[] };
  vkId?: string;
  verifierHashHex?: string;
  tierTag?: string;
  net?: DungeonNetworkConfig;
  onStage?: (stage: "simulating" | "assembling" | "signing" | "submitted" | "confirmed") => void;
}): Promise<NoirUltraHonkOnchainResult> {
  try {
    const net = input.net;
    const rpcUrl = net ? net.rpcUrl : resolveSorobanRpcUrl();
    if (!rpcUrl) {
      throw new Error("Soroban RPC URL not configured. Set PUBLIC_RPC_URL (or PUBLIC_MAINNET_RPC_URL).");
    }

    const farmId = net ? net.farmAttestationsContractId.trim() : FARM_ATTESTATIONS_CONTRACT_ID_MAINNET.trim();
    if (!farmId) {
      throw new Error(`Missing Farm Attestations contract ID (${net?.network ?? "mainnet"})`);
    }

    const passphrase = net ? net.networkPassphrase : (MAINNET_NETWORK_PASSPHRASE || Networks.PUBLIC);

    const tier = tierIdToSampleTier(input.tierId);
    const tierTag = (input.tierTag ?? tier).toString().toUpperCase().slice(0, 32);

    const override = input.proofOverride;
    const sample =
      override ??
      (noirUltraHonkLegacySamples.find((s) => s.tier === tier && s.expectedValid) ??
        noirUltraHonkLegacySamples.find((s) => s.expectedValid));
    if (!sample) throw new Error("No Noir proof available");

    const proofBase64 = String((sample as any)?.proofBase64 ?? (sample as any)?.proof?.proofBase64 ?? "");
    const publicInputsHex: string[] = Array.isArray((sample as any)?.publicInputs)
      ? ((sample as any).publicInputs as string[])
      : Array.isArray((sample as any)?.proof?.publicInputs)
        ? ((sample as any).proof.publicInputs as string[])
        : [];

    if (!proofBase64) {
      throw new Error("Noir sample missing proofBase64");
    }
    if (publicInputsHex.length === 0) {
      throw new Error("Noir sample missing publicInputs");
    }

    const statementHash = ensureBytes32Hex(String((sample as any)?.commitmentDigest ?? publicInputsHex[1] ?? ""));
    const verifierHash = ensureBytes32Hex(input.verifierHashHex ?? noirUltraHonkLegacyVkDigestHex);
    const vkId = (input.vkId ?? DEFAULT_NOIR_ULTRAHONK_VK_ID).toString().slice(0, 32);

    const proofBytes = Buffer.from(proofBase64, "base64");
    const publicInputsBytes = concatPublicInputsBytes(publicInputsHex);

    const server = new Server(rpcUrl);
    const farm = new Contract(farmId);
    const sourceAccount = net
      ? await (() => {
          if (!StrKey.isValidEd25519PublicKey(input.owner)) {
            throw new Error("Hackathon mode requires owner to be a testnet account address (G...).");
          }
          return server.getAccount(input.owner);
        })()
      : new Account(NULL_ACCOUNT, "0");

    // Prefer the multi-VK entrypoint when available (farm-attestations v2+).
    // If the on-chain contract hasn't been upgraded yet, we fall back to the legacy method.
    const opPreferred = farm.call(
      "verify_ultrahonk_vk_and_attest",
      new Address(input.owner).toScVal(),
      symbol("NOIR"),
      symbol(tierTag),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(statementHash))),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(verifierHash))),
      symbol(vkId),
      xdr.ScVal.scvBytes(publicInputsBytes),
      xdr.ScVal.scvBytes(proofBytes),
    );

    const opLegacy = farm.call(
      "verify_ultrahonk_and_attest",
      new Address(input.owner).toScVal(),
      symbol("NOIR"),
      symbol(tierTag),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(statementHash))),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(verifierHash))),
      xdr.ScVal.scvBytes(publicInputsBytes),
      xdr.ScVal.scvBytes(proofBytes),
    );

    const makeTx = (op: any) =>
      new TransactionBuilder(sourceAccount, {
        fee: "10000000",
        networkPassphrase: passphrase,
      })
        .addOperation(op)
        .setTimeout(TimeoutInfinite)
        .build();

    const txPreferred = makeTx(opPreferred);
    const txLegacy = makeTx(opLegacy);

    input.onStage?.("simulating");
    const simPreferred = await server.simulateTransaction(txPreferred);
    const tx = Api.isSimulationError(simPreferred) ? txLegacy : txPreferred;
    const sim = Api.isSimulationError(simPreferred) ? await server.simulateTransaction(txLegacy) : simPreferred;

    if (Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }

    input.onStage?.("assembling");
    const preparedTx = assembleTransaction(tx, sim).build();

    input.onStage?.("signing");

    let txHash: string;
    if (net) {
      txHash = await net.signAndSubmit(preparedTx, { keyId: input.keyId, contractId: input.owner });
    } else {
      const { signAndSend } = await import("../../utils/transaction-helpers");
      const result = await signAndSend(preparedTx, {
        keyId: input.keyId,
        contractId: input.owner,
        turnstileToken: "",
        updateBalance: true,
      });

      if (!result.success) {
        throw new Error(result.error || "Noir UltraHonk on-chain verification failed");
      }

      const { extractTxHashFromRelayerResponse } = await import("../../utils/transaction-helpers");
      txHash =
        result.transactionHash ||
        extractTxHashFromRelayerResponse(result.result) ||
        extractTxHashFromRelayerResponse(result);
      if (!txHash) {
        throw new Error(`Relayer success but no hash discovered in result: ${JSON.stringify(result.result)}`);
      }
    }

    input.onStage?.("submitted");
    const confirmed = await waitForTransaction(server, txHash);
    if (confirmed.status !== Api.GetTransactionStatus.SUCCESS) {
      return { ok: false, txHash, error: "Noir UltraHonk on-chain verification transaction failed" };
    }

    input.onStage?.("confirmed");
    return { ok: true, txHash, ledger: confirmed.ledger };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noir UltraHonk on-chain verification failed" };
  }
}
