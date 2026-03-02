export type VipSession = {
  token: string;
  roomId: string;
  account: string;
  createdAt: number;
  expiresAt: number;
};

export type VipRosterEntry = {
  id: string;
  account: string;
  e2ee: { identity: string; dh: string };
  joinedAt: number;
  lastSeenAt: number;
};

export type VipEvent =
  | {
      seq: number;
      kind: "sender-key-share";
      from: string;
      to: string;
      wrappedKey: string;
      nonce: string;
      keyVersion: number;
      ts: number;
    }
  | {
      seq: number;
      kind: "chat";
      sender: string;
      ciphertext: string;
      nonce: string;
      keyVersion: number;
      signature: string;
      ts: number;
    }
  | { seq: number; kind: "system"; message: string; ts: number };

export type VipEventInput =
  | Omit<Extract<VipEvent, { kind: "sender-key-share" }>, "seq">
  | Omit<Extract<VipEvent, { kind: "chat" }>, "seq">
  | Omit<Extract<VipEvent, { kind: "system" }>, "seq">;

export type VipRoomState = {
  roomId: string;
  rosterByAccount: Map<string, VipRosterEntry>;
  events: VipEvent[];
  nextSeq: number;
};

export type VipStore = {
  sessionsByToken: Map<string, VipSession>;
  roomsById: Map<string, VipRoomState>;
};

const STORE_KEY = "__smolVipStore";

function getGlobalStore(): VipStore {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g[STORE_KEY] as VipStore | undefined;
  if (existing) return existing;

  const created: VipStore = {
    sessionsByToken: new Map(),
    roomsById: new Map(),
  };
  g[STORE_KEY] = created;
  return created;
}

export function getVipStore(): VipStore {
  return getGlobalStore();
}

export function getVipRoom(roomId: string): VipRoomState {
  const store = getVipStore();
  const existing = store.roomsById.get(roomId);
  if (existing) return existing;

  const created: VipRoomState = {
    roomId,
    rosterByAccount: new Map(),
    events: [],
    nextSeq: 1,
  };
  store.roomsById.set(roomId, created);
  return created;
}

export function addVipEvent(
  roomId: string,
  event: VipEventInput,
  opts: { maxEvents: number },
): VipEvent {
  const room = getVipRoom(roomId);
  const next = { ...event, seq: room.nextSeq++ } as VipEvent;
  room.events.push(next);
  if (room.events.length > opts.maxEvents) {
    room.events.splice(0, room.events.length - opts.maxEvents);
  }
  return next;
}

export function createVipSession(params: {
  roomId: string;
  account: string;
  ttlMs: number;
}): VipSession {
  const store = getVipStore();
  const token = crypto.randomUUID();
  const now = Date.now();
  const session: VipSession = {
    token,
    roomId: params.roomId,
    account: params.account,
    createdAt: now,
    expiresAt: now + params.ttlMs,
  };
  store.sessionsByToken.set(token, session);
  return session;
}

export function getVipSession(token: string): VipSession | null {
  const store = getVipStore();
  const session = store.sessionsByToken.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    store.sessionsByToken.delete(token);
    return null;
  }
  return session;
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
