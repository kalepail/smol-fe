/**
 * One sequential, abortable settlement poll (PURE: reads and sleeps injected).
 * Ticks never overlap. The signal is checked after EVERY await, so an aborted
 * loop never publishes `onSettled`/`onFailed` or schedules another tick.
 */
export type SettlementRead = Map<string, 'settled' | 'failed'>;

export function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function pollUntilSettled(params: {
  ids: string[];
  signal: AbortSignal;
  deadline: number;
  read: (ids: string[], signal: AbortSignal) => Promise<SettlementRead>;
  onSettled: (ids: string[]) => void;
  onFailed?: (ids: string[]) => void;
  onTickError?: (error: unknown) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  initialDelayMs?: number;
}): Promise<{ remaining: string[] }> {
  const { signal } = params;
  const sleep = params.sleep ?? abortableSleep;
  const now = params.now ?? Date.now;
  const remaining = new Set(params.ids);
  let delay = 3_000;

  const assertLive = () => {
    if (signal.aborted) throw abortError(signal);
  };

  await sleep(params.initialDelayMs ?? 1_500, signal);
  assertLive();
  while (remaining.size > 0 && now() < params.deadline) {
    const ids = [...remaining];
    let status: SettlementRead | null = null;
    try {
      status = await params.read(ids, signal);
    } catch (error) {
      assertLive();
      params.onTickError?.(error);
    }
    assertLive();
    if (status) {
      const settled = ids.filter((id) => status!.get(id) === 'settled');
      const failed = ids.filter((id) => status!.get(id) === 'failed');
      for (const id of [...settled, ...failed]) remaining.delete(id);
      if (settled.length) params.onSettled(settled);
      if (failed.length) params.onFailed?.(failed);
    }
    if (remaining.size === 0) break;
    assertLive();
    await sleep(delay + Math.floor(Math.random() * 500), signal);
    assertLive();
    delay = Math.min(8_000, Math.round(delay * 1.4));
  }
  return { remaining: [...remaining] };
}
