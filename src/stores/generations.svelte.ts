import { navigate } from 'astro:transitions/client';
import type { SmolDetailResponse } from '../types/domain';
import { toast } from './toast.svelte';

interface TrackedGeneration {
  id: string;
  timer: ReturnType<typeof setTimeout> | null;
  delay: number;
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
  if (entry?.timer) clearTimeout(entry.timer);
  active.delete(id);
  syncActiveIds();
}

export function trackGeneration(id: string) {
  if (typeof window === 'undefined' || !id || active.has(id)) return;
  const entry: TrackedGeneration = { id, timer: null, delay: 4000 };
  active.set(id, entry);
  syncActiveIds();
  schedulePoll(entry);
}

function schedulePoll(entry: TrackedGeneration) {
  entry.timer = setTimeout(async () => {
    if (!active.has(entry.id)) return;

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${entry.id}`, {
        credentials: 'include',
      });

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
      const songs = data.kv_do?.songs ?? [];
      const ready = songs.length > 0 && songs.every((song) => song.music_id && song.status >= 4);
      const wfStatus = data.wf?.status;
      const failed = wfStatus === 'errored' || wfStatus === 'terminated' || wfStatus === 'unknown';

      if (ready || wfStatus === 'complete') {
        stopTrackingGeneration(entry.id);
        const title = data.kv_do?.lyrics?.title || data.d1?.Title || 'Your song';
        const onSongPage = window.location.pathname === `/${entry.id}`;
        if (!onSongPage) {
          if (!generationsState.readyIds.includes(entry.id)) {
            generationsState.readyIds = [...generationsState.readyIds, entry.id];
          }
          toast.success(`"${title}" is ready.`, {
            duration: 8000,
            actionLabel: 'Open',
            onAction: () => {
              void navigate(`/${entry.id}`);
            },
          });
        }
        return;
      }

      if (failed) {
        stopTrackingGeneration(entry.id);
        return;
      }

      entry.delay = Math.min(entry.delay * 1.5, 15000);
      schedulePoll(entry);
    } catch {
      entry.delay = Math.min(entry.delay * 1.5, 15000);
      schedulePoll(entry);
    }
  }, entry.delay);
}
