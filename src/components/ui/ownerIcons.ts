/**
 * Owner-management icons (Teenyicons, MIT, 15x15 grid). Registered on import by
 * the (lazily loaded) owner surfaces only, so the shared Icon component — and
 * therefore the Home bundle — doesn't carry them.
 */
import { extraFilledPaths, extraStrokedPaths } from './Icon.svelte';

Object.assign(extraFilledPaths, {
  'eye-off':
    'M7.5 9C5.186 9 3.561 7.848 2.497 6.666a9.4 9.4 0 0 1-1.449-2.164l-.08-.18l-.004-.007v-.001L.5 4.5l-.464.186v.002l.003.004l.026.063l.078.173a10.4 10.4 0 0 0 1.61 2.406C2.94 8.652 4.814 10 7.5 10zm7-4.5l-.464-.186l-.003.008l-.015.035l-.066.145a9.4 9.4 0 0 1-1.449 2.164C11.44 7.848 9.814 9 7.5 9v1c2.686 0 4.561-1.348 5.747-2.666a10.4 10.4 0 0 0 1.61-2.406a6 6 0 0 0 .104-.236l.002-.004v-.001h.001zM8 12V9.5H7V12zm-6.646-1.646l2-2l-.708-.708l-2 2zm10.292-2l2 2l.708-.708l-2-2z',
  pencil:
    'm.5 9.5l-.354-.354L0 9.293V9.5zm9-9l.354-.354a.5.5 0 0 0-.708 0zm5 5l.354.354a.5.5 0 0 0 0-.708zm-9 9v.5h.207l.147-.146zm-5 0H0a.5.5 0 0 0 .5.5zm.354-4.646l9-9l-.708-.708l-9 9zm8.292-9l5 5l.708-.708l-5-5zm5 4.292l-9 9l.708.708l9-9zM5.5 14h-5v1h5zm-4.5.5v-5H0v5zM6.146 3.854l5 5l.708-.708l-5-5zM8 15h7v-1H8z',
});

Object.assign(extraStrokedPaths, {
  merge:
    'M2.5 10.5a2 2 0 1 0 0 4a2 2 0 0 0 0-4Zm0 0v-6m2-2a2 2 0 1 0-2 2m2-2a2 2 0 0 1-2 2m2-2h5a3 3 0 0 1 3 3v2m0 0a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z',
});
