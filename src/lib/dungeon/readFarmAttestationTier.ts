import { Networks, Account, Contract, Address, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk/minimal";
import { getRpcUrl } from "../../utils/rpc";
import { TIER_VERIFIER_CONTRACT_ID } from "../../components/labs/the-farm/zkTypes";
import type { DungeonNetworkConfig } from "./networkConfig";

const { Api, Server } = rpc;
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export async function readFarmAttestationTier(address: string, net?: DungeonNetworkConfig): Promise<
  | { ok: true; tierId: number; verifiedAt?: number }
  | { ok: false; reason: string }
> {
  try {
    const rpcUrl = net ? net.rpcUrl : (getRpcUrl?.() || "").trim();
    if (!rpcUrl) return { ok: false, reason: "RPC URL not configured" };

    const contractId = net ? net.tierVerifierContractId : TIER_VERIFIER_CONTRACT_ID;
    if (!contractId) return { ok: false, reason: `Tier verifier contract ID not configured (${net?.network ?? "mainnet"})` };

    const passphrase = net ? net.networkPassphrase : Networks.PUBLIC;

    const server = new Server(rpcUrl);
    const contractObj = new Contract(contractId);

    const op = contractObj.call("get_attestation", new Address(address).toScVal());

    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
      fee: "10000000",
      networkPassphrase: passphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (Api.isSimulationError(sim)) {
      return { ok: false, reason: typeof sim.error === "string" ? sim.error : "Simulation error" };
    }

    if (!Api.isSimulationSuccess(sim) || !sim.result?.retval) {
      return { ok: false, reason: "No attestation" };
    }

    const native = scValToNative(sim.result.retval) as any;
    if (!native || native.tier === undefined || native.tier === null) {
      return { ok: false, reason: "No attestation" };
    }

    const tierId = Number(native.tier);
    if (!Number.isFinite(tierId)) return { ok: false, reason: "Malformed tier" };

    const verifiedAt = native.verified_at !== undefined ? Number(native.verified_at) : undefined;
    return { ok: true, tierId, verifiedAt };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Failed to read attestation" };
  }
}
