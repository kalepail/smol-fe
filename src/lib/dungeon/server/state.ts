export type DungeonSession = {
  token: string;
  roomId: string;
  account: string;
  name: string;
  createdAt: number;
  expiresAt: number;
};

export type DungeonRosterEntry = {
  id: string;
  account: string;
  name: string;
  joinedAt: number;
  lastSeenAt: number;
  ready: boolean;
  floor: number;
  attempts: number;
  testnetAddress?: string;
};

export type DungeonEvent =
  | { seq: number; kind: "system"; message: string; ts: number }
  | { seq: number; kind: "ready"; account: string; ready: boolean; ts: number }
  | { seq: number; kind: "start"; ts: number }
  | {
      seq: number;
      kind: "progress";
      account: string;
      floor: number;
      attempts: number;
      ts: number;
    };

export type DungeonEventInput =
  | Omit<Extract<DungeonEvent, { kind: "system" }>, "seq">
  | Omit<Extract<DungeonEvent, { kind: "ready" }>, "seq">
  | Omit<Extract<DungeonEvent, { kind: "start" }>, "seq">
  | Omit<Extract<DungeonEvent, { kind: "progress" }>, "seq">;

export type DungeonRoomState = {
  roomId: string;
  rosterByAccount: Record<string, DungeonRosterEntry>;
  events: DungeonEvent[];
  nextSeq: number;
};

export type DungeonStore = {
  sessionsByToken: Map<string, DungeonSession>;
  roomsById: Map<string, DungeonRoomState>;
};

const STORE_KEY = "__smolDungeonStore";

function getGlobalStore(): DungeonStore {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g[STORE_KEY] as DungeonStore | undefined;
  if (existing) return existing;

  const created: DungeonStore = {
    sessionsByToken: new Map(),
    roomsById: new Map(),
  };
  g[STORE_KEY] = created;
  return created;
}

export function getDungeonStore(): DungeonStore {
  return getGlobalStore();
}

export function getDungeonRoom(roomId: string): DungeonRoomState {
  const store = getDungeonStore();
  const existing = store.roomsById.get(roomId);
  if (existing) return existing;

  const created: DungeonRoomState = {
    roomId,
    rosterByAccount: {},
    events: [],
    nextSeq: 1,
  };
  store.roomsById.set(roomId, created);
  return created;
}

export function addDungeonEvent(
  roomId: string,
  event: DungeonEventInput,
  opts: { maxEvents: number },
): DungeonEvent {
  const room = getDungeonRoom(roomId);
  const next = { ...event, seq: room.nextSeq++ } as DungeonEvent;
  room.events.push(next);
  if (room.events.length > opts.maxEvents) {
    room.events.splice(0, room.events.length - opts.maxEvents);
  }
  return next;
}

export function createDungeonSession(params: {
  roomId: string;
  account: string;
  name: string;
  ttlMs: number;
}): DungeonSession {
  const store = getDungeonStore();
  const token = crypto.randomUUID();
  const now = Date.now();
  const session: DungeonSession = {
    token,
    roomId: params.roomId,
    account: params.account,
    name: params.name,
    createdAt: now,
    expiresAt: now + params.ttlMs,
  };
  store.sessionsByToken.set(token, session);
  return session;
}

export function getDungeonSession(token: string): DungeonSession | null {
  const store = getDungeonStore();
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

/**
 * Mark stale roster entries as disconnected.
 * A player is considered stale if their lastSeenAt is older than `staleMs` ago.
 * Stale players are removed from the roster so the remaining player isn't blocked.
 */
const STALE_THRESHOLD_MS = 30_000; // 30 seconds

export function pruneStaleRoster(roomId: string): string[] {
  const room = getDungeonRoom(roomId);
  const now = Date.now();
  const pruned: string[] = [];

  for (const [account, entry] of Object.entries(room.rosterByAccount)) {
    if (now - entry.lastSeenAt > STALE_THRESHOLD_MS) {
      delete room.rosterByAccount[account];
      pruned.push(account);

      addDungeonEvent(roomId, {
        kind: "system",
        message: `${entry.name} disconnected (stale)`,
        ts: now,
      }, { maxEvents: 200 });
    }
  }

  return pruned;
}

