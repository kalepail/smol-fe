import { Account, Address, Contract, Networks, StrKey, TransactionBuilder, TimeoutInfinite, rpc, xdr } from "@stellar/stellar-sdk/minimal";
import { Buffer } from "buffer";
import { FARM_ATTESTATIONS_CONTRACT_ID_MAINNET, MAINNET_NETWORK_PASSPHRASE, MAINNET_RPC_URL } from "../../config/farmAttestation";
import { ensureBytes32Hex, hexToBytes } from "../the-farm/digest";
import { getRpcUrl } from "../../utils/rpc";
import type { DungeonNetworkConfig } from "./networkConfig";

const { Api, Server, assembleTransaction } = rpc;
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export type DungeonStampKind = "ENTRY" | "WITHDRAWAL";

export type DungeonStampResult =
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
  // Soroban symbols are ASCII-ish, short identifiers.
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
  throw new Error("Dungeon stamp confirmation timed out");
}

/**
 * Passkey-signed audit stamp, recorded to the Farm Attestations contract.
 *
 * This is a digest-only record: it does NOT claim on-chain proof verification.
 *
 * Tx pipeline: simulate -> assemble -> sign/send.
 * When `net` is provided the call routes to that network (testnet for hackathon mode).
 */
export async function publishDungeonStampMainnet(input: {
  owner: string; // passkey smart account contractId (mainnet) or testnet public key
  keyId: string; // passkey keyId (base64) — unused for testnet
  kind: DungeonStampKind;
  statementHash: string; // 32-byte hex
  verifierHash: string; // 32-byte hex
  net?: DungeonNetworkConfig;
  onStage?: (stage: "simulating" | "assembling" | "signing" | "submitted" | "confirmed") => void;
}): Promise<DungeonStampResult> {
  try {
    const net = input.net;
    const contractId = net ? net.farmAttestationsContractId.trim() : FARM_ATTESTATIONS_CONTRACT_ID_MAINNET.trim();
    if (!contractId) {
      throw new Error(`Missing Farm Attestations contract ID (${net?.network ?? "mainnet"})`);
    }

    const rpcUrl = net ? net.rpcUrl : resolveSorobanRpcUrl();
    if (!rpcUrl) {
      throw new Error("Soroban RPC URL not configured. Set PUBLIC_RPC_URL (or PUBLIC_MAINNET_RPC_URL).");
    }

    const passphrase = net ? net.networkPassphrase : (MAINNET_NETWORK_PASSPHRASE || Networks.PUBLIC);

    const statementHash = ensureBytes32Hex(input.statementHash);
    const verifierHash = ensureBytes32Hex(input.verifierHash);

    const server = new Server(rpcUrl);
    const contract = new Contract(contractId);
    const sourceAccount = net
      ? await (() => {
          if (!StrKey.isValidEd25519PublicKey(input.owner)) {
            throw new Error("Hackathon mode requires owner to be a testnet account address (G...).");
          }
          return server.getAccount(input.owner);
        })()
      : new Account(NULL_ACCOUNT, "0");

    // We store dungeon stamps as: system="DUNGEON", tier="ENTRY"|"WITHDRAW".
    const operation = contract.call(
      "attest",
      new Address(input.owner).toScVal(),
      symbol("DUNGEON"),
      symbol(input.kind === "ENTRY" ? "ENTRY" : "WITHDRAW"),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(statementHash))),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(verifierHash))),
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

    let txHash: string;
    if (net) {
      // Network-aware path (hackathon testnet or future multi-network).
      txHash = await net.signAndSubmit(preparedTx, { keyId: input.keyId, contractId: input.owner });
    } else {
      // Legacy mainnet passkey path.
      const { signAndSend } = await import("../../utils/transaction-helpers");
      const result = await signAndSend(preparedTx, {
        keyId: input.keyId,
        contractId: input.owner,
        turnstileToken: "",
        updateBalance: true,
      });

      if (!result.success) {
        throw new Error(result.error || "Dungeon stamp failed");
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
      return { ok: false, txHash, error: "Dungeon stamp transaction failed" };
    }

    input.onStage?.("confirmed");
    return { ok: true, txHash, ledger: confirmed.ledger };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Dungeon stamp failed" };
  }
}
