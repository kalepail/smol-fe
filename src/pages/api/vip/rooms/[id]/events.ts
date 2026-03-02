import type { APIRoute } from "astro";
import { findRoom } from "../../../../../lib/vip/rooms";
import {
  addVipEvent,
  getBearerToken,
  getVipRoom,
  getVipSession,
  type VipEvent,
} from "../../../../../lib/vip/server/state";

const MAX_EVENTS = 200;

function parseCursor(value: string | null): number {
  if (!value) return 0;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

export const GET: APIRoute = async ({ request, params }) => {
  const roomId = params.id || "";
  if (!roomId) return new Response("Room id required", { status: 400 });

  const room = findRoom(roomId);
  if (!room) return new Response("Unknown room", { status: 404 });

  const token = getBearerToken(request);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const session = getVipSession(token);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.roomId !== roomId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const cursor = parseCursor(url.searchParams.get("cursor"));

  const state = getVipRoom(roomId);
  const events = state.events.filter((evt) => evt.seq > cursor);

  return new Response(
    JSON.stringify({
      roster: Array.from(state.rosterByAccount.values()),
      events,
      cursor: state.nextSeq - 1,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const POST: APIRoute = async ({ request, params }) => {
  const roomId = params.id || "";
  if (!roomId) return new Response("Room id required", { status: 400 });

  const room = findRoom(roomId);
  if (!room) return new Response("Unknown room", { status: 404 });

  const token = getBearerToken(request);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const session = getVipSession(token);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.roomId !== roomId) return new Response("Unauthorized", { status: 401 });

  const now = Date.now();

  try {
    const body = (await request.json()) as Partial<VipEvent>;
    if (!body?.kind) return new Response("Missing kind", { status: 400 });

    if (body.kind === "sender-key-share") {
      const from = (body as any).from as string | undefined;
      const to = (body as any).to as string | undefined;
      const wrappedKey = (body as any).wrappedKey as string | undefined;
      const nonce = (body as any).nonce as string | undefined;
      const keyVersion = (body as any).keyVersion as number | undefined;

      if (!from || from !== session.account) return new Response("Invalid sender", { status: 400 });
      if (!to || !wrappedKey || !nonce || typeof keyVersion !== "number") {
        return new Response("Malformed sender-key-share", { status: 400 });
      }

      addVipEvent(
        roomId,
        {
          kind: "sender-key-share",
          from,
          to,
          wrappedKey,
          nonce,
          keyVersion,
          ts: typeof (body as any).ts === "number" ? (body as any).ts : now,
        },
        { maxEvents: MAX_EVENTS }
      );

      return new Response(JSON.stringify({ ok: true, cursor: getVipRoom(roomId).nextSeq - 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.kind === "chat") {
      const sender = (body as any).sender as string | undefined;
      const ciphertext = (body as any).ciphertext as string | undefined;
      const nonce = (body as any).nonce as string | undefined;
      const keyVersion = (body as any).keyVersion as number | undefined;
      const signature = (body as any).signature as string | undefined;
      const ts = (body as any).ts as number | undefined;

      if (!sender || sender !== session.account) return new Response("Invalid sender", { status: 400 });
      if (!ciphertext || !nonce || !signature || typeof keyVersion !== "number") {
        return new Response("Malformed chat event", { status: 400 });
      }
      if (ciphertext.length > 20000) return new Response("Message too large", { status: 400 });

      addVipEvent(
        roomId,
        {
          kind: "chat",
          sender,
          ciphertext,
          nonce,
          keyVersion,
          signature,
          ts: typeof ts === "number" ? ts : now,
        },
        { maxEvents: MAX_EVENTS }
      );

      return new Response(JSON.stringify({ ok: true, cursor: getVipRoom(roomId).nextSeq - 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.kind === "system") {
      // System messages are server-authored only.
      return new Response("Forbidden", { status: 403 });
    }

    return new Response("Unsupported event kind", { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event write failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

