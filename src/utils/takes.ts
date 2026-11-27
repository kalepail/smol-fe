import type { MusicProvider, SmolDetailResponse } from '../types/domain';

export type { MusicProvider };

export const DEFAULT_PROVIDER: MusicProvider = 'aisonggenerator';

export const PROVIDER_STORAGE_KEY = 'smol:provider';

export interface ProviderMeta {
  id: MusicProvider;
  label: string;
  takeCopy: string;
  etaCopy: string;
  description: string;
  expectedTakes: 1 | 2;
}

export const PROVIDER_META: Record<MusicProvider, ProviderMeta> = {
  aisonggenerator: {
    id: 'aisonggenerator',
    label: 'Classic',
    takeCopy: '2 takes · ~2–6 min',
    etaCopy: 'Classic creates 2 takes in roughly 2 to 6 minutes. You can leave this page while it finishes.',
    description: 'Creates two full takes so you can compare and pick a favorite.',
    expectedTakes: 2,
  },
  elevenlabs: {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    takeCopy: '1 take · about a minute',
    etaCopy: 'ElevenLabs creates 1 take, usually in about a minute. You can leave this page while it finishes.',
    description: 'Faster generation producing one complete track.',
    expectedTakes: 1,
  },
};

export const PROMPT_LIMITS = {
  instrumental: 380,
  lyrical: 2280,
} as const;

export function maxPromptLength(instrumental: boolean): number {
  return instrumental ? PROMPT_LIMITS.instrumental : PROMPT_LIMITS.lyrical;
}

export function normalizeProvider(value: unknown): MusicProvider | null {
  return value === 'aisonggenerator' || value === 'elevenlabs' ? value : null;
}

export function readStoredProvider(): MusicProvider {
  if (typeof window === 'undefined') return DEFAULT_PROVIDER;
  try {
    return normalizeProvider(localStorage.getItem(PROVIDER_STORAGE_KEY)) ?? DEFAULT_PROVIDER;
  } catch {
    return DEFAULT_PROVIDER;
  }
}

export function saveStoredProvider(provider: MusicProvider): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

export function requestedProviderOf(data?: SmolDetailResponse | null): MusicProvider {
  return (
    normalizeProvider(data?.kv_do?.generation_meta?.requested_provider) ??
    normalizeProvider(data?.kv_do?.requested_provider) ??
    normalizeProvider(data?.kv_do?.payload?.provider) ??
    normalizeProvider(data?.d1?.Requested_Provider) ??
    DEFAULT_PROVIDER
  );
}

export function actualProviderOf(data?: SmolDetailResponse | null): MusicProvider | null {
  return (
    normalizeProvider(data?.kv_do?.generation_meta?.actual_provider) ??
    normalizeProvider(data?.kv_do?.actual_provider) ??
    normalizeProvider(data?.d1?.Actual_Provider) ??
    null
  );
}

export function providerOf(data?: SmolDetailResponse | null): MusicProvider {
  return (
    actualProviderOf(data) ??
    normalizeProvider(data?.kv_do?.active_provider) ??
    requestedProviderOf(data)
  );
}

export function wasFallback(data?: SmolDetailResponse | null): boolean {
  const requested = requestedProviderOf(data);
  const actual = actualProviderOf(data);
  return actual !== null && actual !== requested;
}

export function expectedTakeCount(provider: MusicProvider): 1 | 2 {
  return provider === 'elevenlabs' ? 1 : 2;
}

export function otherProviderOf(provider: MusicProvider): MusicProvider {
  return provider === 'elevenlabs' ? 'aisonggenerator' : 'elevenlabs';
}
