export const turnstileState = $state<{
  token: string | null;
}>({
  token: null,
});

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;

export function setTurnstileToken(token: string) {
  turnstileState.token = token;
}

export function clearTurnstileToken() {
  turnstileState.token = null;
}

export function getTurnstileToken(): string | null {
  return turnstileState.token;
}

export function turnstileCallback(token: string) {
  setTurnstileToken(token);
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as unknown as { turnstile?: unknown }).turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Turnstile verification script.'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface TurnstileApi {
  ready(cb: () => void): void;
  render(
    container: HTMLElement | string,
    opts: {
      sitekey: string;
      appearance?: string;
      'response-field'?: boolean;
      'feedback-enabled'?: boolean;
      callback?: (token: string) => void;
      'error-callback'?: (err: unknown) => void;
      'expired-callback'?: () => void;
    }
  ): string;
  reset(id?: string): void;
}

export async function ensureTurnstileToken(): Promise<string> {
  if (turnstileState.token) return turnstileState.token;

  const sitekey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
  if (!sitekey) {
    throw new Error('Verification service is not configured.');
  }

  await loadTurnstileScript();

  const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
  if (!api) {
    throw new Error('Verification widget unavailable.');
  }

  let container = document.getElementById('smol-turnstile-host');
  if (!container) {
    container = document.createElement('div');
    container.id = 'smol-turnstile-host';
    container.className = 'fixed bottom-0 right-0 z-[70]';
    document.body.appendChild(container);
  }

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Verification timed out. Please try again.'));
    }, 30_000);

    api.ready(() => {
      if (widgetId) {
        try {
          api.reset(widgetId);
        } catch {
          widgetId = null;
        }
      }
      widgetId = api.render(container!, {
        sitekey,
        appearance: 'interaction-only',
        'response-field': false,
        'feedback-enabled': false,
        callback: (token: string) => {
          clearTimeout(timeout);
          setTurnstileToken(token);
          resolve(token);
        },
        'error-callback': (err: unknown) => {
          clearTimeout(timeout);
          reject(new Error(String(err || 'Verification failed.')));
        },
        'expired-callback': () => {
          clearTurnstileToken();
        },
      });
    });
  });
}
