import { Account, Address, Contract, Networks, StrKey, TransactionBuilder, TimeoutInfinite, rpc, xdr } from "@stellar/stellar-sdk/minimal";
import { Buffer } from "buffer";
import { MAINNET_NETWORK_PASSPHRASE, MAINNET_RPC_URL } from "../../config/farmAttestation";
import { FARM_ATTESTATIONS_CONTRACT_ID_MAINNET } from "../../config/farmAttestation";
import { RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET } from "../../config/risc0Groth16Verifier";
import { ensureBytes32Hex, hexToBytes } from "../the-farm/digest";
import { getRpcUrl } from "../../utils/rpc";
import type { DungeonNetworkConfig } from "./networkConfig";

// Generated offline (WSL + Docker) via: `zk/risc0-tier/host` exporter.
import risc0Groth16Sample from "../../data/dungeon/risc0_groth16_sample.json";

const { Api, Server, assembleTransaction } = rpc;
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// Universal verifier path (preferred): farm-attestations Groth16 VK registry.
// Keep <= 32 chars for Symbol.
const RISC0_GROTH16_VK_ID = "R0G16V1";

export type Risc0Groth16VerifyResult =
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
  throw new Error("RISC0 Groth16 on-chain verification confirmation timed out");
}

/**
 * On-chain proof verification for a RISC0 Groth16 receipt.
 *
 * When `net` is provided the call routes to that network (testnet for hackathon mode).
 */
export async function publishRisc0Groth16VerifyMainnet(input: {
  owner: string;
  keyId: string;
  proofOverride?: {
    claim_digest_hex: string;
    public_inputs_hex: string[];
    proof: { pi_a_b64: string; pi_b_b64: string; pi_c_b64: string };
  };
  net?: DungeonNetworkConfig;
  onStage?: (stage: "simulating" | "assembling" | "signing" | "submitted" | "confirmed") => void;
}): Promise<Risc0Groth16VerifyResult> {
  try {
    const net = input.net;
    const rpcUrl = net ? net.rpcUrl : resolveSorobanRpcUrl();
    if (!rpcUrl) {
      throw new Error("Soroban RPC URL not configured. Set PUBLIC_RPC_URL (or PUBLIC_MAINNET_RPC_URL).");
    }

    const passphrase = net ? net.networkPassphrase : (MAINNET_NETWORK_PASSPHRASE || Networks.PUBLIC);

    const sample: any = (input.proofOverride ?? (risc0Groth16Sample as any)) as any;
    const claimDigestHex = ensureBytes32Hex(String(sample.claim_digest_hex ?? ""));
    const publicInputsHex: string[] = Array.isArray(sample.public_inputs_hex) ? sample.public_inputs_hex : [];
    if (publicInputsHex.length !== 5) {
      throw new Error("Invalid RISC0 Groth16 sample: expected 5 public inputs");
    }

    const piAB64 = String(sample.proof?.pi_a_b64 ?? "");
    const piBB64 = String(sample.proof?.pi_b_b64 ?? "");
    const piCB64 = String(sample.proof?.pi_c_b64 ?? "");
    if (!piAB64 || !piBB64 || !piCB64) {
      throw new Error("Invalid RISC0 Groth16 sample: missing proof bytes");
    }

    const piA = Buffer.from(piAB64, "base64");
    const piB = Buffer.from(piBB64, "base64");
    const piC = Buffer.from(piCB64, "base64");
    if (piA.length !== 64 || piB.length !== 128 || piC.length !== 64) {
      throw new Error(`Invalid RISC0 Groth16 sample proof lengths: a=${piA.length} b=${piB.length} c=${piC.length}`);
    }

    const server = new Server(rpcUrl);
    const sourceAccount = net
      ? await (() => {
          if (!StrKey.isValidEd25519PublicKey(input.owner)) {
            throw new Error("Hackathon mode requires owner to be a testnet account address (G...).");
          }
          return server.getAccount(input.owner);
        })()
      : new Account(NULL_ACCOUNT, "0");

    const proofStruct = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: symbol("pi_a"), val: xdr.ScVal.scvBytes(piA) }),
      new xdr.ScMapEntry({ key: symbol("pi_b"), val: xdr.ScVal.scvBytes(piB) }),
      new xdr.ScMapEntry({ key: symbol("pi_c"), val: xdr.ScVal.scvBytes(piC) }),
    ]);

    const publicInputsVec = xdr.ScVal.scvVec(
      publicInputsHex.map((hex) => xdr.ScVal.scvBytes(Buffer.from(hexToBytes(ensureBytes32Hex(hex))))),
    );

    // Prefer the "universal" verifier path via farm-attestations (VK registry).
    const tryUniversalFirst = async (): Promise<{
      tx: any;
      contractLabel: string;
    } | null> => {
      const farmId = net ? net.farmAttestationsContractId.trim() : FARM_ATTESTATIONS_CONTRACT_ID_MAINNET.trim();
      if (!farmId) return null;

      const farm = new Contract(farmId);
      const op = farm.call(
        "verify_groth16_and_attest",
        new Address(input.owner).toScVal(),
        symbol("RISC0"),
        symbol("SPROUT"),
        xdr.ScVal.scvBytes(Buffer.from(hexToBytes(claimDigestHex))), // statement_hash
        xdr.ScVal.scvBytes(Buffer.from(hexToBytes(claimDigestHex))), // verifier_hash (digest-only identifier)
        symbol(RISC0_GROTH16_VK_ID),
        publicInputsVec,
        proofStruct,
      );

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000000",
        networkPassphrase: passphrase,
      })
        .addOperation(op)
        .setTimeout(TimeoutInfinite)
        .build();

      // Probe simulation: if contract hasn't been upgraded or VK isn't registered, this will fail.
      const sim = await server.simulateTransaction(tx);
      if (Api.isSimulationError(sim)) {
        return null;
      }

      return { tx, contractLabel: `farm-attestations(${farmId})` };
    };

    const buildDedicated = (): { tx: any; contractLabel: string } => {
      const contractId = net ? net.risc0Groth16VerifierContractId.trim() : RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET.trim();
      if (!contractId) {
        throw new Error(
          `RISC0 on-chain verification unavailable: farm-attestations Groth16 registry is not ready and RISC0 verifier contract ID is missing (${net?.network ?? "mainnet"}).`,
        );
      }

      const contract = new Contract(contractId);
      const op = contract.call(
        "verify_and_attest",
        new Address(input.owner).toScVal(),
        xdr.ScVal.scvBytes(Buffer.from(hexToBytes(claimDigestHex))),
        publicInputsVec,
        proofStruct,
      );

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000000",
        networkPassphrase: passphrase,
      })
        .addOperation(op)
        .setTimeout(TimeoutInfinite)
        .build();

      return { tx, contractLabel: `risc0-groth16-verifier(${contractId})` };
    };

    const universal = await tryUniversalFirst();
    const { tx, contractLabel } = universal ?? buildDedicated();

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
        throw new Error(result.error || `RISC0 Groth16 on-chain verification failed (${contractLabel})`);
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
      return { ok: false, txHash, error: "RISC0 Groth16 verification transaction failed" };
    }

    input.onStage?.("confirmed");
    return { ok: true, txHash, ledger: confirmed.ledger };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "RISC0 Groth16 verification failed" };
  }
}
