import { Networks, StrKey } from "@stellar/stellar-sdk";
import { findRoom } from "../rooms";
import { getVipNetworkPassphrase } from "./auth";

function horizonBaseForNetwork(networkPassphrase: string): string {
  if (networkPassphrase === Networks.PUBLIC) return "https://horizon.stellar.org";
  if (networkPassphrase === Networks.TESTNET) return "https://horizon-testnet.stellar.org";
  throw new Error("Unsupported Stellar network passphrase for VIP eligibility checks.");
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Horizon request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function accountExists(address: string): Promise<boolean> {
  const networkPassphrase = getVipNetworkPassphrase();
  const horizon = horizonBaseForNetwork(networkPassphrase);
  const res = await fetch(`${horizon}/accounts/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json" },
  });
  return res.ok;
}

async function earliestAccountTransactionCreatedAt(address: string): Promise<string> {
  const networkPassphrase = getVipNetworkPassphrase();
  const horizon = horizonBaseForNetwork(networkPassphrase);
  const data = await fetchJson(
    `${horizon}/accounts/${encodeURIComponent(
      address
    )}/transactions?order=asc&limit=1`
  );
  const record = data?._embedded?.records?.[0];
  const createdAt = record?.created_at as string | undefined;
  if (!createdAt) {
    throw new Error("Unable to determine earliest transaction time.");
  }
  return createdAt;
}

export async function checkVipEligibility(params: {
  roomId: string;
  address: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const room = findRoom(params.roomId);
  if (!room) {
    return { ok: false, reason: "Unknown VIP room." };
  }
  if (room.status !== "enabled") {
    return { ok: false, reason: "This room is not enabled yet." };
  }
  if (!StrKey.isValidEd25519PublicKey(params.address)) {
    return { ok: false, reason: "Invalid Stellar public key." };
  }

  try {
    if (room.qualifier.type === "commons") {
      const exists = await accountExists(params.address);
      if (!exists) {
        return { ok: false, reason: "Account not found on this network." };
      }
      return { ok: true };
    }

    if (room.qualifier.type === "lumenauts") {
      const exists = await accountExists(params.address);
      if (!exists) {
        return { ok: false, reason: "Account not found on this network." };
      }
      const cutoff = room.qualifier.cutoffTs;
      if (!cutoff) {
        return { ok: false, reason: "Room cutoff is not configured." };
      }
      const earliest = await earliestAccountTransactionCreatedAt(params.address);
      if (new Date(earliest).getTime() >= new Date(cutoff).getTime()) {
        return {
          ok: false,
          reason: `Not eligible: earliest transaction (${earliest}) is after cutoff (${cutoff}).`,
        };
      }
      return { ok: true };
    }

    // Placeholder / coming soon rooms are already blocked by status !== enabled.
    return { ok: false, reason: "Room verifier not implemented." };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Eligibility check failed.",
    };
  }
}

