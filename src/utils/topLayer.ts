const openDialogs: HTMLDialogElement[] = [];
const overlayHosts = new Set<HTMLElement>();
let swapListenerBound = false;

export function getTopLayerRoot(): HTMLElement {
  for (let i = openDialogs.length - 1; i >= 0; i--) {
    const dialog = openDialogs[i];
    if (dialog.isConnected && dialog.open) {
      return dialog;
    }
  }
  return document.body;
}

export function syncTopLayerOverlays() {
  if (typeof document === 'undefined' || !document.body) return;
  const root = getTopLayerRoot();
  for (const el of overlayHosts) {
    if (el.parentElement !== root) {
      root.appendChild(el);
    }
  }
}

function bindSwapListener() {
  if (swapListenerBound || typeof document === 'undefined') return;
  swapListenerBound = true;
  document.addEventListener('astro:after-swap', () => {
    syncTopLayerOverlays();
  });
}

export function registerOpenDialog(dialog: HTMLDialogElement) {
  if (typeof document === 'undefined') return;
  bindSwapListener();
  const idx = openDialogs.indexOf(dialog);
  if (idx !== -1) openDialogs.splice(idx, 1);
  openDialogs.push(dialog);
  document.documentElement.style.overflow = 'hidden';
  syncTopLayerOverlays();
}

export function unregisterOpenDialog(dialog: HTMLDialogElement) {
  if (typeof document === 'undefined') return;
  const idx = openDialogs.indexOf(dialog);
  if (idx !== -1) openDialogs.splice(idx, 1);
  if (openDialogs.length === 0) {
    document.documentElement.style.overflow = '';
  }
  syncTopLayerOverlays();
}

export function registerTopLayerOverlay(el: HTMLElement): () => void {
  if (typeof document === 'undefined') return () => {};
  bindSwapListener();
  overlayHosts.add(el);
  syncTopLayerOverlays();
  return () => {
    overlayHosts.delete(el);
  };
}
