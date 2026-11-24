/**
 * `Retry-After` (delta-seconds or HTTP date) → milliseconds, clamped to 0.5–30 s.
 * Missing or unparseable values default to 1 s (the backend's create_pending hint).
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number {
  if (!value) return 1000;
  const trimmed = value.trim();
  const seconds = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(trimmed) - now;
  if (!Number.isFinite(ms)) return 1000;
  return Math.min(30_000, Math.max(500, Math.round(ms)));
}
