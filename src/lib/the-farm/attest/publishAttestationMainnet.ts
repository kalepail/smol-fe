import { Account, Address, Contract, TransactionBuilder, TimeoutInfinite, rpc, xdr } from "@stellar/stellar-sdk/minimal";
import { Buffer } from "buffer";
import { MAINNET_NETWORK_PASSPHRASE, MAINNET_RPC_URL, FARM_ATTESTATIONS_CONTRACT_ID_MAINNET } from "../../../config/farmAttestation";
import { ensureBytes32Hex, hexToBytes } from "../digest";
import type { AttestationResult, ProofSystem, Tier } from "../types";
import { getRpcUrl } from "../../../utils/rpc";

const { Api, Server, assembleTransaction } = rpc;
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

interface PublishAttestationInput {
  owner: string;
  keyId: string;
  system: ProofSystem;
  tier: Tier;
  statementHash: string;
  verifierHash: string;
}

function symbolForSystem(system: ProofSystem): string {
  switch (system) {
    case "circom":
      return "CIRCOM";
    case "noir":
      return "NOIR";
    case "risc0":
      return "RISC0";
  }
}

function symbolForTier(tier: Tier): string {
  switch (tier) {
    case "sprout":
      return "SPROUT";
    case "grower":
      return "GROWER";
    case "harvester":
      return "HARVEST";
    case "whale":
      return "WHALE";
    case "edge":
      return "EDGE";
    case "invalid":
      return "INVALID";
  }
}

function resolveSorobanRpcUrl(): string {
  const fromEnv = MAINNET_RPC_URL.trim();
  if (fromEnv) return fromEnv;

  try {
    const selected = (getRpcUrl?.() ?? "").trim();
    if (selected) return selected;
  } catch {
    // Ignore selector errors and fall back to env-based config.
  }

  const fallback = (import.meta.env.PUBLIC_RPC_URL ?? "").trim();
  if (fallback) return fallback;

  return "";
}

function waitInterval(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = globalThis.setInterval(() => {
      globalThis.clearInterval(handle);
      resolve();
    }, milliseconds);
  });
}

async function waitForTransaction(
  server: rpc.Server,
  hash: string,
): Promise<rpc.Api.GetTransactionResponse> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const tx = await server.getTransaction(hash);
    if (tx.status === Api.GetTransactionStatus.SUCCESS || tx.status === Api.GetTransactionStatus.FAILED) {
      return tx;
    }
    await waitInterval(1200);
  }
  throw new Error("Mainnet attestation confirmation timed out");
}

export async function publishAttestationMainnet(
  input: PublishAttestationInput,
): Promise<AttestationResult> {
  try {
    const statementHash = ensureBytes32Hex(input.statementHash);
    const verifierHash = ensureBytes32Hex(input.verifierHash);

    const rpcUrl = resolveSorobanRpcUrl();
    if (!rpcUrl) {
      throw new Error("Soroban RPC URL not configured. Set PUBLIC_RPC_URL (or PUBLIC_MAINNET_RPC_URL).");
    }

    const server = new Server(rpcUrl);

    const contract = new Contract(FARM_ATTESTATIONS_CONTRACT_ID_MAINNET);
    const operation = contract.call(
      "attest",
      new Address(input.owner).toScVal(),
      xdr.ScVal.scvSymbol(symbolForSystem(input.system)),
      xdr.ScVal.scvSymbol(symbolForTier(input.tier)),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(statementHash))),
      xdr.ScVal.scvBytes(Buffer.from(hexToBytes(verifierHash))),
    );

    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
      fee: "10000000", // Increase to 1 XLM for mainnet reliability
      networkPassphrase: MAINNET_NETWORK_PASSPHRASE,
    })
      .addOperation(operation)
      .setTimeout(TimeoutInfinite)
      .build();

    const simulation = await server.simulateTransaction(tx);
    if (Api.isSimulationError(simulation)) {
      throw new Error(`Simulation failed: ${simulation.error}`);
    }

    const preparedTx = assembleTransaction(tx, simulation).build();

    // Use unified signAndSend which handles relayer, connectivity, and retries
    const { signAndSend } = await import("../../../utils/transaction-helpers");

    // We pass the preparedTx to signAndSend. 
    // It will handle kit.connectWallet internally if needed.
    const result = await signAndSend(preparedTx, {
      keyId: input.keyId,
      contractId: input.owner,
      turnstileToken: "", // Mainnet attestation typically uses Direct (OZ) mode if available
      updateBalance: true
    });

    if (!result.success) {
      throw new Error(result.error || "Mainnet attestation failed");
    }

    const { extractTxHashFromRelayerResponse } = await import("../../../utils/transaction-helpers");
    const txHash =
      result.transactionHash ||
      extractTxHashFromRelayerResponse(result.result) ||
      extractTxHashFromRelayerResponse(result);
    if (!txHash) {
      throw new Error(`Relayer success but no hash discovered in result: ${JSON.stringify(result.result)}`);
    }

    const confirmed = await waitForTransaction(server, txHash);
    if (confirmed.status !== Api.GetTransactionStatus.SUCCESS) {
      return {
        ok: false,
        txHash,
        error: "Mainnet attestation transaction failed",
      };
    }

    return {
      ok: true,
      txHash,
      ledger: confirmed.ledger,
      feeCharged: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mainnet attestation failed",
    };
  }
}
