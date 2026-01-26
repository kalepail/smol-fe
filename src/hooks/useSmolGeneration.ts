import { userState } from '../stores/user.svelte.ts';

export interface GenerationStatus {
  status?: 'queued' | 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'waiting' | 'waitingForPause' | 'unknown';
}

export function useSmolGeneration() {
  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

  async function postGen(
    prompt: string,
    isPublic: boolean,
    isInstrumental: boolean,
    playlist: string | null
  ): Promise<string | null> {
    const id = await fetch(API_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: userState.contractId,
        prompt,
        public: isPublic,
        instrumental: isInstrumental,
        playlist,
      }),
    }).then(async (res) => {
      if (res.ok) return res.text();
      else throw await res.text();
    });

    if (id) {
      history.pushState({}, '', `/${id}`);
    }

    return id;
  }

  async function retryGen(id: string): Promise<string | null> {
    const newId = await fetch(`${API_URL}/retry/${id}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: userState.contractId,
      }),
    }).then(async (res) => {
      if (res.ok) return res.text();
      else throw await res.text();
    });

    if (newId) {
      history.pushState({}, '', `/${newId}`);
    }

    return newId;
  }

  async function getGen(id: string) {
    return fetch(`${API_URL}/${id}`)
      .then(async (res) => {
        if (res.ok) return res.json();
        else throw await res.text();
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
