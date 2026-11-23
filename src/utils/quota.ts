import type { MusicProvider } from '../types/domain';
import { PROVIDER_META } from './takes';

export interface ProviderQuota {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
}

export type QuotaSummary = Record<MusicProvider, ProviderQuota | null>;

interface RawQuotaEntry {
  limit?: unknown;
  used?: unknown;
  remaining?: unknown;
  resetAt?: unknown;
}

interface RawQuotaResponse {
  classic?: RawQuotaEntry;
  aisonggenerator?: RawQuotaEntry;
  elevenlabs?: RawQuotaEntry;
}

interface RawQuotaErrorBody {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  provider?: unknown;
  limit?: unknown;
  used?: unknown;
  remaining?: unknown;
  resetAt?: unknown;
  scope?: unknown;
  window?: unknown;
}

export class QuotaExceededError extends Error {
  readonly status = 429;
  readonly code = 'quota_exceeded';
  readonly provider: MusicProvider | null;
  readonly limit: number | null;
  readonly used: number | null;
  readonly remaining: number;
  readonly resetAt: string | null;
  readonly scope: 'user' | 'global';
  readonly window: 'day' | 'minute';

  constructor(
    message: string,
    details: {
      provider: MusicProvider | null;
      limit: number | null;
      used: number | null;
      remaining: number;
      resetAt: string | null;
      scope?: 'user' | 'global';
      window?: 'day' | 'minute';
    }
  ) {
    super(message);
    this.name = 'QuotaExceededError';
    this.provider = details.provider;
    this.limit = details.limit;
    this.used = details.used;
    this.remaining = details.remaining;
    this.resetAt = details.resetAt;
    this.scope = details.scope ?? 'user';
    this.window = details.window ?? 'day';
  }
}

export function normalizeQuotaProvider(value: unknown): MusicProvider | null {
  if (value === 'classic' || value === 'aisonggenerator') return 'aisonggenerator';
  if (value === 'elevenlabs') return 'elevenlabs';
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeResetAt(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function parseRetryAfterHeader(retryAfter?: string | null): string | null {
  if (!retryAfter) return null;
  const trimmed = retryAfter.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(Date.now() + seconds * 1000).toISOString();
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseProviderQuota(raw: unknown): ProviderQuota | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as RawQuotaEntry;
  const limit = toFiniteNumber(entry.limit);
  const used = toFiniteNumber(entry.used);
  const remaining = toFiniteNumber(entry.remaining);
  if (limit === null || remaining === null) return null;

  const safeLimit = Math.max(0, Math.floor(limit));
  const safeRemaining = Math.max(0, Math.floor(remaining));
  const safeUsed =
    used !== null ? Math.max(0, Math.floor(used)) : Math.max(0, safeLimit - safeRemaining);

  return {
    limit: safeLimit,
    used: safeUsed,
    remaining: safeRemaining,
    resetAt: normalizeResetAt(entry.resetAt),
  };
}

export function parseQuotaResponse(raw: unknown): QuotaSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as RawQuotaResponse;
  const classic = parseProviderQuota(body.classic ?? body.aisonggenerator);
  const elevenlabs = parseProviderQuota(body.elevenlabs);
  if (!classic && !elevenlabs) return null;
  return {
    aisonggenerator: classic,
    elevenlabs,
  };
}

export function formatQuotaReset(resetAt: string | number | null | undefined): string | null {
  const iso = normalizeResetAt(resetAt);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `at ${time}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  if (isTomorrow) return `tomorrow at ${time}`;

  return `on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

export function formatQuotaExceededMessage(details: {
  provider: MusicProvider | null;
  limit?: number | null;
  resetAt?: string | number | null;
  scope?: 'user' | 'global';
  window?: 'day' | 'minute';
}): string {
  const label = details.provider ? PROVIDER_META[details.provider].label : null;
  const resetText = formatQuotaReset(details.resetAt);

  if (details.window === 'minute') {
    const base = 'Too many song requests right now';
    return resetText ? `${base}. Try again ${resetText}.` : `${base}. Please wait a moment and try again.`;
  }

  if (details.scope === 'global') {
    const base = label
      ? `Daily platform capacity reached for ${label}`
      : 'Daily platform capacity reached';
    return resetText ? `${base}. Resets ${resetText}.` : `${base}. Try again after it resets.`;
  }

  const base =
    label && details.limit && details.limit > 0
      ? `You've used all ${details.limit} ${label} songs for today`
      : label
        ? `Daily ${label} limit reached`
        : 'Daily generation limit reached';
  return resetText ? `${base}. Resets ${resetText}.` : `${base}. Try again after it resets.`;
}

export function parseQuotaExceededError(
  status: number,
  bodyText: string,
  retryAfterHeader?: string | null
): QuotaExceededError | null {
  if (status !== 429) return null;

  let parsed: RawQuotaErrorBody | null = null;
  try {
    const json = JSON.parse(bodyText);
    if (json && typeof json === 'object') {
      parsed = json as RawQuotaErrorBody;
    }
  } catch {
    // Plain-text 429 response.
  }

  const provider = normalizeQuotaProvider(parsed?.provider);
  const limit = toFiniteNumber(parsed?.limit);
  const used = toFiniteNumber(parsed?.used);
  const remaining = Math.max(0, Math.floor(toFiniteNumber(parsed?.remaining) ?? 0));
  const resetAt =
    normalizeResetAt(parsed?.resetAt) ?? parseRetryAfterHeader(retryAfterHeader);
  const scope = parsed?.scope === 'global' ? 'global' : 'user';
  const windowKind = parsed?.window === 'minute' ? 'minute' : 'day';

  const isStructuredQuota =
    parsed?.code === 'quota_exceeded' || provider !== null || limit !== null || resetAt !== null;

  const message = isStructuredQuota
    ? formatQuotaExceededMessage({ provider, limit, resetAt, scope, window: windowKind })
    : (typeof parsed?.error === 'string' && parsed.error.trim()) ||
      (typeof parsed?.message === 'string' && parsed.message.trim()) ||
      bodyText.trim() ||
      formatQuotaExceededMessage({ provider: null });

  return new QuotaExceededError(message, {
    provider,
    limit,
    used,
    remaining,
    resetAt,
    scope,
    window: windowKind,
  });
}

export function extractErrorMessage(bodyText: string, fallback: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return fallback;
  try {
    const json = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof json?.error === 'string' && json.error.trim()) return json.error.trim();
    if (typeof json?.message === 'string' && json.message.trim()) return json.message.trim();
  } catch {
    // Plain-text error body.
  }
  return trimmed;
}

export async function fetchUserQuota(signal?: AbortSignal): Promise<QuotaSummary | null> {
  const apiUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) return null;

  try {
    const response = await fetch(`${apiUrl}/quota`, {
      credentials: 'include',
      signal,
    });
    if (!response.ok) return null;
    const raw = await response.json();
    return parseQuotaResponse(raw);
  } catch {
    // Non-blocking and graceful when endpoint is unavailable or request is aborted.
    return null;
  }
}
