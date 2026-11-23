import type { MusicProvider, SmolDetailResponse } from '../types/domain';
import { DEFAULT_PROVIDER } from '../utils/takes';

export interface GenerationStatus {
  status?: 'queued' | 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'waiting' | 'waitingForPause' | 'unknown';
}

export function useSmolGeneration() {
  async function postGen(
    prompt: string,
    isPublic: boolean,
    isInstrumental: boolean,
    playlist: string | null,
    provider: MusicProvider = DEFAULT_PROVIDER
  ): Promise<string | null> {
    const body: Record<string, unknown> = {
      prompt,
      public: isPublic,
      instrumental: isInstrumental,
      provider,
    };
    if (playlist) {
      body.playlist = playlist;
    }

    const id = await fetch(import.meta.env.PUBLIC_API_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (res.ok) return res.text();
      const message = await res.text();
      throw new Error(message || 'Failed to start generation.');
    });

    if (id) {
      history.pushState({}, '', `/${id}`);
    }

    return id;
  }

  async function retryGen(
    id: string,
    overrideProvider?: MusicProvider
  ): Promise<string | null> {
    const newId = await fetch(`${import.meta.env.PUBLIC_API_URL}/retry/${id}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        overrideProvider ? { override_provider: overrideProvider } : {}
      ),
    }).then(async (res) => {
      if (res.ok) return res.text();
      const message = await res.text();
      throw new Error(message || 'Failed to retry generation.');
    });

    if (newId) {
      history.pushState({}, '', `/${newId}`);
    }

    return newId;
  }

  async function getGen(id: string): Promise<SmolDetailResponse> {
    return fetch(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
      credentials: 'include',
    }).then(async (res) => {
      if (res.ok) return res.json();
      const message = await res.text();
      const error = new Error(message || 'Failed to load smol') as Error & { status?: number };
      error.status = res.status;
      throw error;
    });
  }

  function shouldStopPolling(status?: string): boolean {
    switch (status) {
      case 'errored':
      case 'terminated':
      case 'complete':
      case 'unknown':
        return true;
      default:
        return false;
    }
  }

  function isFailed(status?: string): boolean {
    return status !== 'complete' && shouldStopPolling(status);
  }

  return {
    postGen,
    retryGen,
    getGen,
    shouldStopPolling,
    isFailed,
  };
}
