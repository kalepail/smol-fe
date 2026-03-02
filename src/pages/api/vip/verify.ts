import type { APIRoute } from "astro";
import { findRoom } from "../../../lib/vip/rooms";
import { verifyVipChallengeTx } from "../../../lib/vip/server/auth";
import { checkVipEligibility } from "../../../lib/vip/server/eligibility";
import { createVipSession } from "../../../lib/vip/server/state";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (Labs-only)

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as {
      roomId?: string;
      address?: string;
      xdr?: string;
    };

    const roomId = body?.roomId?.trim() || "";
    const address = body?.address?.trim() || "";
    const xdr = body?.xdr?.trim() || "";

    if (!roomId || !address || !xdr) {
      return new Response(
        JSON.stringify({ token: "", roomStatus: "rejected", reason: "Missing roomId/address/xdr" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const room = findRoom(roomId);
    if (!room) {
      return new Response(
        JSON.stringify({ token: "", roomStatus: "rejected", reason: "Unknown VIP room" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const auth = verifyVipChallengeTx({
      request,
      challengeXdr: xdr,
      clientAddress: address,
    });
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ token: "", roomStatus: "rejected", reason: auth.error }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const eligible = await checkVipEligibility({ roomId, address });
    if (!eligible.ok) {
      return new Response(
        JSON.stringify({ token: "", roomStatus: "rejected", reason: eligible.reason }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = createVipSession({ roomId, account: address, ttlMs: SESSION_TTL_MS });

    return new Response(JSON.stringify({ token: session.token, roomStatus: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIP verification failed";
    return new Response(JSON.stringify({ token: "", roomStatus: "rejected", reason: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

