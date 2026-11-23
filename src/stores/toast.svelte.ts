export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  tag?: string;
  actionLabel?: string;
  onAction?: () => void;
}

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const toastState = $state<{ items: ToastItem[] }>({
  items: [],
});

export function dismissToast(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toastState.items = toastState.items.filter((item) => item.id !== id);
}

export function dismissToastsByTag(tag: string) {
  for (const item of toastState.items) {
    if (item.tag === tag) {
      const timer = timers.get(item.id);
      if (timer) {
        clearTimeout(timer);
        timers.delete(item.id);
      }
    }
  }
  toastState.items = toastState.items.filter((item) => item.tag !== tag);
}

export function showToast(
  message: string,
  options: {
    tone?: ToastTone;
    duration?: number;
    tag?: string;
    actionLabel?: string;
    onAction?: () => void;
  } = {}
): number {
  const id = nextId++;
  const tone = options.tone ?? 'info';
  const duration = options.duration ?? (tone === 'error' ? 6000 : 4000);

  let remaining = toastState.items;
  if (options.tag) {
    for (const item of remaining) {
      if (item.tag === options.tag) {
        const existingTimer = timers.get(item.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          timers.delete(item.id);
        }
      }
    }
    remaining = remaining.filter((item) => item.tag !== options.tag);
  }

  toastState.items = [
    ...remaining.slice(-2),
    {
      id,
      message,
      tone,
      tag: options.tag,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    },
  ];

  if (duration > 0) {
    timers.set(id, setTimeout(() => dismissToast(id), duration));
  }
  return id;
}

export const toast = {
  info: (message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number; tag?: string }) =>
    showToast(message, { ...opts, tone: 'info' }),
  success: (message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number; tag?: string }) =>
    showToast(message, { ...opts, tone: 'success' }),
  error: (message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number; tag?: string }) =>
    showToast(message, { ...opts, tone: 'error' }),
};
