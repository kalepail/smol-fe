export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export const confirmState = $state<{
  open: boolean;
  options: ConfirmOptions | null;
}>({
  open: false,
  options: null,
});

let resolver: ((value: boolean) => void) | null = null;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (resolver) {
    resolver(false);
    resolver = null;
  }
  confirmState.options = options;
  confirmState.open = true;
  return new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
}

export function resolveConfirm(result: boolean) {
  confirmState.open = false;
  const current = resolver;
  resolver = null;
  current?.(result);
}
