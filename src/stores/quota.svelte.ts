import type { MusicProvider } from '../types/domain';
import {
  fetchUserQuota,
  type QuotaExceededError,
  type QuotaSummary,
} from '../utils/quota';

const state = $state<{
  summary: QuotaSummary | null;
  loadedFor: string | null;
  loading: boolean;
}>({
  summary: null,
  loadedFor: null,
  loading: false,
});

export const quotaState: Readonly<typeof state> = state;

let activeController: AbortController | null = null;
let requestSeq = 0;

export function clearQuota(): void {
  activeController?.abort();
  activeController = null;
  ++requestSeq;
  state.summary = null;
  state.loadedFor = null;
  state.loading = false;
}

export async function refreshQuota(contractId: string | null | undefined): Promise<QuotaSummary | null> {
  if (!contractId) {
    clearQuota();
    return null;
  }

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const seq = ++requestSeq;

  if (state.loadedFor !== contractId) {
    state.summary = null;
  }
  state.loading = true;

  const result = await fetchUserQuota(controller.signal);
  if (seq !== requestSeq) return null;

  state.loading = false;
  if (result) {
    state.summary = result;
    state.loadedFor = contractId;
  }
  return result;
}

export function applyQuotaExceeded(err: QuotaExceededError, contractId?: string | null): void {
  // Only zero out per-user daily remaining on user daily quota exhaustion (not burst or global caps).
  if (!err.provider || err.scope === 'global' || err.window === 'minute') return;
  const existing = state.summary?.[err.provider] ?? null;
  const limit = err.limit ?? existing?.limit ?? 0;
  const used = err.used ?? (limit > 0 ? limit : existing?.used ?? 0);
  const resetAt = err.resetAt ?? existing?.resetAt ?? null;

  state.summary = {
    aisonggenerator: state.summary?.aisonggenerator ?? null,
    elevenlabs: state.summary?.elevenlabs ?? null,
    [err.provider]: {
      limit,
      used,
      remaining: 0,
      resetAt,
    },
  };
  if (contractId) {
    state.loadedFor = contractId;
  }
}

export function decrementQuota(provider: MusicProvider): void {
  const current = state.summary?.[provider];
  if (!current) return;
  const nextRemaining = Math.max(0, current.remaining - 1);
  const nextUsed =
    current.limit > 0 ? Math.min(current.limit, current.used + 1) : current.used + 1;
  state.summary = {
    aisonggenerator: state.summary?.aisonggenerator ?? null,
    elevenlabs: state.summary?.elevenlabs ?? null,
    [provider]: {
      ...current,
      used: nextUsed,
      remaining: nextRemaining,
    },
  };
}
