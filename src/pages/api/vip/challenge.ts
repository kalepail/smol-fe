import type { APIRoute } from "astro";
import { StrKey } from "@stellar/stellar-sdk";
import { buildVipChallengeTxXdr } from "../../../lib/vip/server/auth";
import { findRoom } from "../../../lib/vip/rooms";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { roomId?: string; address?: string };
    const roomId = body?.roomId?.trim() || "";
    const address = body?.address?.trim() || "";

    if (!roomId) {
      return new Response(JSON.stringify({ error: "roomId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const room = findRoom(roomId);
    if (!room) {
      return new Response(JSON.stringify({ error: "Unknown VIP room" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (room.status !== "enabled") {
      return new Response(JSON.stringify({ error: "Room not enabled" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!address || !StrKey.isValidEd25519PublicKey(address)) {
      return new Response(JSON.stringify({ error: "Valid Stellar address required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const xdr = buildVipChallengeTxXdr({ request, clientAddress: address });
    return new Response(JSON.stringify({ xdr }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIP challenge failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

