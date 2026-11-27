import { navigate } from 'astro:transitions/client';
import type { SmolDetailResponse } from '../types/domain';
import { expectedTakeCount, providerOf } from '../utils/takes';
import { combineAbortSignals } from '../utils/pollLoop';
import { toast } from './toast.svelte';

interface TrackedGeneration {
  id: string;
  timer: ReturnType<typeof setTimeout> | null;
  delay: number;
  pageReaders: number;
  request?: AbortController;
}

const active = new Map<string, TrackedGeneration>();

export const generationsState = $state<{
  activeIds: string[];
  readyIds: string[];
}>({
  activeIds: [],
  readyIds: [],
});

function syncActiveIds() {
  generationsState.activeIds = Array.from(active.keys());
}

export function clearReadyNotifications() {
  generationsState.readyIds = [];
}

export function stopTrackingGeneration(id: string) {
  const entry = active.get(id);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.request?.abort();
  active.delete(id);
  syncActiveIds();
}

/** Keep the generation in the header, but let the open song view do the reads. */
export function pauseBackgroundGenerationPolling(id: string): () => void {
  let entry = active.get(id);
  if (!entry) {
    entry = { id, timer: null, delay: 4000, pageReaders: 0 };
    active.set(id, entry);
    syncActiveIds();
  }
  entry.pageReaders++;
  if (entry.timer) clearTimeout(entry.timer);
  entry.request?.abort();
  return () => {
    entry.pageReaders--;
    if (entry.pageReaders === 0 && active.get(id) === entry) schedulePoll(entry);
  };
}

function schedulePoll(entry: TrackedGeneration) {
  entry.timer = setTimeout(async () => {
    if (active.get(entry.id) !== entry || entry.pageReaders) return;
    const request = new AbortController();
    entry.request = request;

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${entry.id}?no_view=1`, {
        credentials: 'include',
        signal: combineAbortSignals(request.signal, AbortSignal.timeout(30_000)),
      });
      if (request.signal.aborted) return;

      if (response.status === 404) {
        entry.delay = Math.min(entry.delay * 1.5, 15000);
        schedulePoll(entry);
        return;
      }

      if (!response.ok) {
        stopTrackingGeneration(entry.id);
        return;
      }

      const data = (await response.json()) as SmolDetailResponse;
      if (request.signal.aborted) return;
      const songs = data.kv_do?.songs ?? [];
      const expected = expectedTakeCount(providerOf(data));
      const ready = songs.length >= expected && songs.every((song) => song.music_id && song.status >= 4);
      const published = Boolean(data.d1?.Id) && !data.wf;
      const wfStatus = data.wf?.status;
      const failed = wfStatus === 'errored' || wfStatus === 'terminated' || wfStatus === 'unknown';

      const title = data.kv_do?.lyrics?.title || data.d1?.Title || 'Your song';
      const onSongPage = window.location.pathname === `/${entry.id}`;
      const openAction = { duration: 8000, actionLabel: 'Open', onAction: () => void navigate(`/${entry.id}`) };

      if (ready || published || wfStatus === 'complete') {
        stopTrackingGeneration(entry.id);
        if (!onSongPage) {
          if (!generationsState.readyIds.includes(entry.id)) {
            generationsState.readyIds = [...generationsState.readyIds, entry.id];
          }
          toast.success(`"${title}" is ready.`, openAction);
        }
        return;
      }

      if (failed) {
        stopTrackingGeneration(entry.id);
        // The song page shows its own failure card.
        if (!onSongPage) toast.error(`"${title}" couldn't be created. Open it to retry or edit the prompt.`, openAction);
        return;
      }

      entry.delay = Math.min(entry.delay * 1.5, 15000);
      schedulePoll(entry);
    } catch {
      if (request.signal.aborted) return;
      entry.delay = Math.min(entry.delay * 1.5, 15000);
      schedulePoll(entry);
    } finally {
      if (entry.request === request) entry.request = undefined;
    }
  }, entry.delay);
}
