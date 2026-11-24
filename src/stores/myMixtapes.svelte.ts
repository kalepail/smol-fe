/**
 * The signed-in owner's mixtapes (GET /mixtapes/mine): one fetch, many readers
 * (index "Yours", detail owner surface, builder coaching, Account sheet).
 * Stale-while-revalidate for 60s; every lifecycle write calls
 * `invalidateMyMixtapes()` so the next read is fresh.
 */
import { listMyMixtapes, MixtapeActionError, type OwnedMixtape } from '../services/api/mixtapes';
import { userState } from './user.svelte';
import { createLatestGate } from '../utils/latestRequest';

const STALE_AFTER_MS = 60_000;

export type MyMixtapesStatus = 'idle' | 'loading' | 'ready' | 'error';

export const myMixtapesState = $state<{
  owner: string | null;
  items: OwnedMixtape[];
  status: MyMixtapesStatus;
  error: string | null;
  loadedAt: number;
}>({
  owner: null,
  items: [],
  status: 'idle',
  error: null,
  loadedAt: 0,
});

/**
 * Bumped after any owner write so open views (e.g. the detail page) can refetch
 * the mixtapes they show. `ids` lists the mixtapes that changed.
 */
export const mixtapeChangeSignal = $state<{ version: number; ids: string[] }>({ version: 0, ids: [] });

let inflight: Promise<OwnedMixtape[]> | null = null;
/** Strictly monotonic request ids: an older (even forced) response never overwrites a newer one. */
const requests = createLatestGate();

/** Restored/merged card to focus once it is back in the list (25d P2-7). */
export const myMixtapesFocus = $state<{ id: string | null }>({ id: null });

function resetFor(owner: string | null) {
  requests.reset();
  inflight = null;
  myMixtapesState.owner = owner;
  myMixtapesState.items = [];
  myMixtapesState.status = 'idle';
  myMixtapesState.error = null;
  myMixtapesState.loadedAt = 0;
}

/** Ensure the cache belongs to the current user; clears it on sign-out / account switch. */
function syncOwner(): string | null {
  const owner = userState.contractId;
  if (myMixtapesState.owner !== owner) resetFor(owner);
  return owner;
}

export function seedMyMixtapes(items: OwnedMixtape[], owner: string | null = userState.contractId) {
  if (!owner) return;
  if (myMixtapesState.owner !== owner) resetFor(owner);
  myMixtapesState.items = items.filter((item) => item.creator === owner);
  myMixtapesState.status = 'ready';
  myMixtapesState.error = null;
  myMixtapesState.loadedAt = Date.now();
}

export async function loadMyMixtapes(options: { force?: boolean } = {}): Promise<OwnedMixtape[]> {
  const owner = syncOwner();
  if (!owner) return [];

  const fresh = myMixtapesState.status === 'ready' && Date.now() - myMixtapesState.loadedAt < STALE_AFTER_MS;
  if (fresh && !options.force) return myMixtapesState.items;
  if (inflight && !options.force) return inflight;

  const run = requests.begin();
  if (myMixtapesState.status !== 'ready') myMixtapesState.status = 'loading';
  myMixtapesState.error = null;

  const request = listMyMixtapes()
    .then((items) => {
      if (!requests.isCurrent(run) || myMixtapesState.owner !== owner) return myMixtapesState.items;
      myMixtapesState.items = items.filter((item) => item.creator === owner);
      myMixtapesState.status = 'ready';
      myMixtapesState.loadedAt = Date.now();
      return myMixtapesState.items;
    })
    .catch((error: unknown) => {
      if (!requests.isCurrent(run)) return myMixtapesState.items;
      // Keep showing what we had (SWR) — only surface the error when there is nothing.
      if (myMixtapesState.status !== 'ready') {
        myMixtapesState.status = 'error';
        myMixtapesState.error =
          error instanceof MixtapeActionError && error.kind === 'auth'
            ? 'Sign in again to see your mixtapes.'
            : 'Check your connection and try again.';
      }
      return myMixtapesState.items;
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });

  inflight = request;
  return request;
}

/** Mark the cache stale, notify open views, and refetch in the background. */
export function invalidateMyMixtapes(changedIds: string[] = []) {
  myMixtapesState.loadedAt = 0;
  mixtapeChangeSignal.ids = changedIds;
  mixtapeChangeSignal.version += 1;
  if (userState.contractId) void loadMyMixtapes({ force: true });
}

/** Optimistically drop a mixtape (delete/merge) before the refetch lands. */
export function removeOwnedLocally(id: string) {
  myMixtapesState.items = myMixtapesState.items.filter((item) => item.id !== id);
}

export function findOwnedMixtape(id: string | null | undefined): OwnedMixtape | undefined {
  if (!id) return undefined;
  return myMixtapesState.items.find((item) => item.id === id);
}

const countsDerived = $derived.by(() => {
  let listed = 0;
  let hidden = 0;
  for (const item of myMixtapesState.items) {
    if (item.visibility === 'owner') hidden += 1;
    else listed += 1;
  }
  return { listed, hidden, total: listed + hidden };
});

export const myMixtapesCounts = {
  get current() {
    return countsDerived;
  },
};
