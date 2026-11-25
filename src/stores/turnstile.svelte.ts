import { getTopLayerRoot } from '../utils/topLayer';

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
  remove?(id?: string): void;
}

function teardownWidget(api: TurnstileApi, container: HTMLElement | null) {
  if (widgetId) {
    try {
      api.remove?.(widgetId);
    } catch {
      // Ignore cleanup errors if the widget was already detached.
    }
    widgetId = null;
  }
  container?.remove();
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

  // Always tear down any previous widget/container before mounting into the active
  // top-layer root (open modal <dialog> if present, otherwise document.body) so
  // interactive challenges stay visible and non-inert without stacking widgets.
  teardownWidget(api, document.getElementById('smol-turnstile-host'));

  const container = document.createElement('div');
  container.id = 'smol-turnstile-host';
  container.className =
    'fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] right-[max(16px,env(safe-area-inset-right,0px))] z-[90]';
  getTopLayerRoot().appendChild(container);

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      teardownWidget(api, container);
      cb();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Verification timed out. Please try again.')));
    }, 30_000);

    api.ready(() => {
      if (settled) return;
      widgetId = api.render(container, {
        sitekey,
        appearance: 'interaction-only',
        'response-field': false,
        'feedback-enabled': false,
        callback: (token: string) => {
          finish(() => {
            setTurnstileToken(token);
            resolve(token);
          });
        },
        'error-callback': (err: unknown) => {
          finish(() => reject(new Error(String(err || 'Verification failed.'))));
        },
        'expired-callback': () => {
          clearTurnstileToken();
        },
      });
    });
  });
}
