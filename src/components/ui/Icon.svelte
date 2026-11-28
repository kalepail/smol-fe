<script lang="ts" module>
  /** Paths registered by lazily loaded features (see ownerIcons.ts) so Home never ships them. */
  export const extraFilledPaths: Partial<Record<string, string>> = {};
  export const extraStrokedPaths: Partial<Record<string, string>> = {};
</script>

<script lang="ts">
  /**
   * Unified icon set: Teenyicons (MIT, 15x15 native optical grid).
   * Filled entries include both solid glyphs and pre-outlined fill paths from Teenyicons;
   * stroked entries use native 1px strokes on the 15x15 grid for uniform visual weight.
   */
  export type IconName =
    | 'play'
    | 'pause'
    | 'next'
    | 'prev'
    | 'heart'
    | 'heart-solid'
    | 'home'
    | 'home-solid'
    | 'search'
    | 'plus'
    | 'plus-circle'
    | 'mixtapes'
    | 'mixtapes-solid'
    | 'user'
    | 'user-solid'
    | 'x'
    | 'chevron-down'
    | 'chevron-left'
    | 'chevron-right'
    | 'grip'
    | 'ellipsis'
    | 'share'
    | 'copy'
    | 'check'
    | 'trash'
    | 'info'
    | 'warning'
    | 'refresh'
    | 'external'
    | 'lyrics'
    | 'globe'
    | 'lock'
    | 'cart'
    | 'arrow-up'
    | 'arrow-down'
    | 'logout'
    | 'wallet'
    | 'music'
    | 'sparkles'
    | 'stop'
    | 'diamond'
    | 'question'
    | 'eye-off'
    | 'pencil'
    | 'merge';

  interface Props {
    name: IconName;
    size?: number;
    class?: string;
    label?: string;
  }

  let { name, size = 20, class: className = '', label }: Props = $props();

  const FILLED_PATHS: Partial<Record<IconName, string>> = {
    play: 'M4.79 2.093A.5.5 0 0 0 4 2.5v10a.5.5 0 0 0 .79.407l7-5a.5.5 0 0 0 0-.814z',
    pause: 'M4 2.5h2.25v10H4zm4.75 0H11v10H8.75z',
    stop: 'M12 3H3v9h9z',
    next: 'M1.79 2.093A.5.5 0 0 0 1 2.5v10a.5.5 0 0 0 .79.407l7-5a.5.5 0 0 0 0-.814zM13 13h1V2h-1z',
    prev: 'M13.21 2.093A.5.5 0 0 1 14 2.5v10a.5.5 0 0 1-.79.407l-7-5a.5.5 0 0 1 0-.814zM1 13h1V2H1z',
    'heart-solid': 'M4.036 1a4.036 4.036 0 0 0-2.854 6.89l5.964 5.964a.5.5 0 0 0 .708 0l5.964-5.965a4.036 4.036 0 0 0-5.707-5.707l-.611.61l-.61-.61A4.04 4.04 0 0 0 4.035 1',
    'home-solid': 'M7.854.146a.5.5 0 0 0-.708 0L1 6.293V13.5A1.5 1.5 0 0 0 2.5 15h10a1.5 1.5 0 0 0 1.5-1.5V6.293z',
    'mixtapes-solid': 'M7.697 1.04a.5.5 0 0 0-.394 0l-7 3a.5.5 0 0 0 0 .92l7 3a.5.5 0 0 0 .394 0l7-3a.5.5 0 0 0 0-.92zM7.5 9.956L.697 7.04l-.394.92L7.5 11.044l7.197-3.084l-.394-.92zM.697 10.04l-.394.92L7.5 14.044l7.197-3.084l-.394-.92L7.5 12.956z',
    'user-solid': 'M7.5 0a3.499 3.499 0 1 0 0 6.996A3.499 3.499 0 1 0 7.5 0m-2 8.994a3.5 3.5 0 0 0-3.5 3.5v2.497h11v-2.497a3.5 3.5 0 0 0-3.5-3.5z',
    diamond: 'M11.783 0H3.217L.07 5.243a.5.5 0 0 0 .034.564l7 9a.5.5 0 0 0 .79 0l7-9a.5.5 0 0 0 .034-.564z',
    heart: 'm7.5 13.5l-.354.354a.5.5 0 0 0 .708 0zM1.536 7.536l-.354.353zm5-5l-.354.353zM7.5 3.5l-.354.354a.5.5 0 0 0 .708 0zm.964-.964l-.353-.354zm-.61 10.61L1.889 7.182l-.707.707l5.964 5.965zm5.257-5.964l-5.965 5.964l.708.708l5.964-5.965zM6.182 2.889l.964.965l.708-.708l-.965-.964zm1.672.965l.964-.965l-.707-.707l-.965.964zM10.964 1c-1.07 0-2.096.425-2.853 1.182l.707.707A3.04 3.04 0 0 1 10.964 2zM14 5.036c0 .805-.32 1.577-.89 2.146l.708.707A4.04 4.04 0 0 0 15 5.036zm1 0A4.036 4.036 0 0 0 10.964 1v1A3.036 3.036 0 0 1 14 5.036zM4.036 2c.805 0 1.577.32 2.146.89l.707-.708A4.04 4.04 0 0 0 4.036 1zM1 5.036A3.036 3.036 0 0 1 4.036 2V1A4.036 4.036 0 0 0 0 5.036zm.89 2.146A3.04 3.04 0 0 1 1 5.036H0c0 1.07.425 2.096 1.182 2.853z',
    home: 'm7.5.5l.354-.354a.5.5 0 0 0-.708 0zm-6 6l-.354-.354L1 6.293V6.5zm12 0h.5v-.207l-.146-.147zm.354-.354l-6-6l-.708.708l6 6zm-6.708-6l-6 6l.708.708l6-6zM14 13.5v-7h-1v7zm-13-7v7h1v-7zM2.5 15h10v-1h-10zM13 13.5a.5.5 0 0 1-.5.5v1a1.5 1.5 0 0 0 1.5-1.5zm-12 0A1.5 1.5 0 0 0 2.5 15v-1a.5.5 0 0 1-.5-.5z',
    mixtapes: 'm7.5 1.5l.197-.46a.5.5 0 0 0-.394 0zm-7 3l-.197-.46a.5.5 0 0 0 0 .92zm7 3l-.197.46a.5.5 0 0 0 .394 0zm7-3l.197.46a.5.5 0 0 0 0-.92zm-7 6l-.197.46l.197.084l.197-.084zm0 3l-.197.46l.197.084l.197-.084zM7.303 1.04l-7 3l.394.92l7-3zm-7 3.92l7 3l.394-.92l-7-3zm7.394 3l7-3l-.394-.92l-7 3zm7-3.92l-7-3l-.394.92l7 3zM.303 7.96l7 3l.394-.92l-7-3zm7.394 3l7-3l-.394-.92l-7 3zm-7.394 0l7 3l.394-.92l-7-3zm7.394 3l7-3l-.394-.92l-7 3z',
    copy: 'm10.5.5l.277-.416L10.651 0H10.5zm3 2h.5v-.268l-.223-.148zm-1 9.5h-8v1h8zM4 11.5v-10H3v10zM4.5 1h6V0h-6zM13 2.5v9h1v-9zM10.223.916l3 2l.554-.832l-3-2zM4.5 12a.5.5 0 0 1-.5-.5H3A1.5 1.5 0 0 0 4.5 13zm8 1a1.5 1.5 0 0 0 1.5-1.5h-1a.5.5 0 0 1-.5.5zM4 1.5a.5.5 0 0 1 .5-.5V0A1.5 1.5 0 0 0 3 1.5zm-3 2v10h1v-10zM2.5 15h8v-1h-8zm0-12h1V2h-1zM12 13.5v-1h-1v1zM10.5 15a1.5 1.5 0 0 0 1.5-1.5h-1a.5.5 0 0 1-.5.5zM1 13.5A1.5 1.5 0 0 0 2.5 15v-1a.5.5 0 0 1-.5-.5zm1-10a.5.5 0 0 1 .5-.5V2A1.5 1.5 0 0 0 1 3.5z',
    info: 'M7 4.5V5h1v-.5zm1-.01v-.5H7v.5zM8 11V7H7v4zm0-6.5v-.01H7v.01zM6 8h1.5V7H6zm0 3h3v-1H6zM7.5 1A6.5 6.5 0 0 1 14 7.5h1A7.5 7.5 0 0 0 7.5 0zM1 7.5A6.5 6.5 0 0 1 7.5 1V0A7.5 7.5 0 0 0 0 7.5zM7.5 14A6.5 6.5 0 0 1 1 7.5H0A7.5 7.5 0 0 0 7.5 15zm0 1A7.5 7.5 0 0 0 15 7.5h-1A6.5 6.5 0 0 1 7.5 14z',
    warning: 'M8 10.5V10H7v.5zm-1 .01v.5h1v-.5zM7 4v4h1V4zm0 6.5v.01h1v-.01zm.5 3.5A6.5 6.5 0 0 1 1 7.5H0A7.5 7.5 0 0 0 7.5 15zM14 7.5A6.5 6.5 0 0 1 7.5 14v1A7.5 7.5 0 0 0 15 7.5zM7.5 1A6.5 6.5 0 0 1 14 7.5h1A7.5 7.5 0 0 0 7.5 0zm0-1A7.5 7.5 0 0 0 0 7.5h1A6.5 6.5 0 0 1 7.5 1z',
    external: 'M13.5 1.5h.5a.5.5 0 0 0-.5-.5zm0-.5H8v1h5.5zm-.5.5V7h1V1.5zm.146-.354l-12 12l.708.708l12-12z',
    globe: 'M4.5 5.5V5a.5.5 0 0 0-.5.5zm0 1l.354.354L5 6.707V6.5zm-1.707.293l-.354.353zM6.5 13H7v-.207l-.146-.147zm-1-1H5v.207l.146.147zm0-1.5H6v-.207l-.146-.147zm-1-1H4v.207l.146.147zm0-1V8a.5.5 0 0 0-.5.5zM9 .5v2h1v-2zM8.5 3h-1v1h1zm-3 2h-1v1h1zM4 5.5v1h1v-1zm.146.646l-.292.293l.707.707l.293-.292zm-1 .293L1.354 4.646l-.708.708L2.44 7.146zM6 4.5a.5.5 0 0 1-.5.5v1A1.5 1.5 0 0 0 7 4.5zM7.5 3A1.5 1.5 0 0 0 6 4.5h1a.5.5 0 0 1 .5-.5zM3.854 6.44a.5.5 0 0 1-.708 0l-.707.706a1.5 1.5 0 0 0 2.122 0zM9 2.5a.5.5 0 0 1-.5.5v1A1.5 1.5 0 0 0 10 2.5zm-2 12V13H6v1.5zm-.146-1.854l-1-1l-.708.708l1 1zM6 12v-1.5H5V12zm-.146-1.854l-1-1l-.708.708l1 1zM5 9.5v-1H4v1zM4.5 9h4V8h-4zm4.5.5v.667h1V9.5zm1.833 2.5H13.5v-1h-2.667zM10 11.167c0 .46.373.833.833.833v-1c.092 0 .167.075.167.167zM9.833 11c.092 0 .167.075.167.167h1C11 10.522 10.478 10 9.833 10zM9 10.167c0 .46.373.833.833.833v-1c.092 0 .167.075.167.167zM8.5 9a.5.5 0 0 1 .5.5h1A1.5 1.5 0 0 0 8.5 8zm-1 5A6.5 6.5 0 0 1 1 7.5H0A7.5 7.5 0 0 0 7.5 15zM14 7.5A6.5 6.5 0 0 1 7.5 14v1A7.5 7.5 0 0 0 15 7.5zM7.5 1A6.5 6.5 0 0 1 14 7.5h1A7.5 7.5 0 0 0 7.5 0zm0-1A7.5 7.5 0 0 0 0 7.5h1A6.5 6.5 0 0 1 7.5 1z',
    'arrow-up': 'm7.5 1.5l.354-.354L7.5.793l-.354.353zm-.354.354l4 4l.708-.708l-4-4zm0-.708l-4 4l.708.708l4-4zM7 1.5V14h1V1.5z',
    sparkles: 'm6.853 8.848l.354-.353l-.707-.707l-.353.353zM9 10.493v.5h1v-.5zm1-.999v-.5H9v.5zM9 1.5V2h1v-.5zm1-1V0H9v.5zM4.5 4.997H4v1h.5zm1 1H6v-1h-.5zm8-1H13v1h.5zm1 1h.5v-1h-.5zm-2.353-3.852l-.354.354l.707.707l.353-.354zm1.706-.292l.354-.353L13.5.792l-.353.354zm-8-.707L5.5.792l-.707.708l.354.353zm.294 1.706l.353.354l.707-.707l-.354-.354zm6.706 5.29l-.353-.354l-.707.707l.354.353zm.294 1.706l.353.353l.707-.707l-.354-.354zM.853 14.844l6-5.996l-.706-.707l-6 5.996zM10 10.495v-1H9v1zM10 1.5v-1H9v1zM4.5 5.997h1v-1h-1zm9 0h1v-1h-1zm-.647-3.145l1-.999l-.706-.707l-1 1zm-7.706-.999l1 1l.706-.708l-1-1zm7 6.995l1 1l.706-.708l-1-.999z',
  };

  const STROKED_PATHS: Partial<Record<IconName, string>> = {
    search: 'm14.5 14.5l-4-4m-4 2a6 6 0 1 1 0-12a6 6 0 0 1 0 12Z',
    plus: 'M7.5 1v13M1 7.5h13',
    'plus-circle': 'M7.5 4v7M4 7.5h7m-3.5 7a7 7 0 1 1 0-14a7 7 0 0 1 0 14Z',
    user: 'M10.5 3.498a3 3 0 0 1-3 2.998a2.999 2.999 0 1 1 3-2.998Zm2 10.992h-10v-1.996a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3z',
    x: 'm1.5 1.5l12 12m-12 0l12-12',
    'chevron-down': 'm14 5l-6.5 7L1 5',
    'chevron-left': 'M10 14L3 7.5L10 1',
    'chevron-right': 'm5 14l7-6.5L5 1',
    grip: 'M9.5 3a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1Zm0 5a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1Zm0 5a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1Zm-4-10a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1Zm0 5a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1Zm0 5a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1Z',
    ellipsis: 'M3 7.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0Zm5 0a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0Zm5 0a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0Z',
    share: 'm7.5 1.5l3.25 3m-3.25-3l-3 3m3-3V11m6-4v6.5h-12V7',
    check: 'm1 7l4.5 4.5L14 3',
    trash: 'M4.5 3V1.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V3M0 3.5h15m-13.5 0v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-10M7.5 7v5m-3-3v3m6-3v3',
    refresh: 'M7.5 14.5A7 7 0 0 1 3.17 2M7.5.5A7 7 0 0 1 11.83 13m-.33-3v3.5H15M0 1.5h3.5V5',
    lyrics: 'M2.5 4v2.5a5 5 0 0 0 5 5m5-7.5v2.5a5 5 0 0 1-5 5m0 0V15M5 14.5h5m-.5-12v4a2 2 0 1 1-4 0v-4a2 2 0 1 1 4 0Z',
    lock: 'M4.5 6.5v-3a3 3 0 0 1 6 0v3m-8 0h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z',
    cart: 'm.5.5l.6 2m0 0l2.4 8h11v-6a2 2 0 0 0-2-2zm11.4 12a1 1 0 1 1 0-2a1 1 0 0 1 0 2Zm-8-1a1 1 0 1 1 2 0a1 1 0 0 1-2 0Z',
    'arrow-down': 'm7.5 13.5l4-4m-4 4l-4-4m4 4V1',
    logout: 'm13.5 7.5l-3 3.25m3-3.25l-3-3m3 3H4m4 6H1.5v-12H8',
    wallet: 'M13.5 6V2.5a1 1 0 0 0-1-1h-11a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9m.93-3.5H9.5a2 2 0 1 0 0 4h4.93a.07.07 0 0 0 .07-.07V5.57a.07.07 0 0 0-.07-.07Z',
    music: 'M1.5 9.5h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Zm0 0v-3a6 6 0 1 1 12 0v3m0 0h-1a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1Z',
    question: 'M7.5 9V7.5H8A1.5 1.5 0 0 0 9.5 6v-.1a1.4 1.4 0 0 0-1.4-1.4h-.6A1.5 1.5 0 0 0 6 6m1 4.5h1m-.5 4a7 7 0 1 1 0-14a7 7 0 0 1 0 14Z',
  };

  const SQUARE_CAP_ICONS = new Set<IconName>([
    'user',
    'chevron-down',
    'chevron-left',
    'chevron-right',
    'check',
  ]);

  const filledPath = $derived(FILLED_PATHS[name] ?? extraFilledPaths[name]);
  const strokedPath = $derived(STROKED_PATHS[name] ?? extraStrokedPaths[name]);
  const linecap = $derived(SQUARE_CAP_ICONS.has(name) ? 'square' : undefined);
</script>

{#if filledPath}
  <svg
    width={size}
    height={size}
    viewBox="0 0 15 15"
    fill="currentColor"
    class="shrink-0 {className}"
    aria-hidden={label ? undefined : 'true'}
    aria-label={label}
    role={label ? 'img' : undefined}
  >
    <path d={filledPath} />
  </svg>
{:else if strokedPath}
  <svg
    width={size}
    height={size}
    viewBox="0 0 15 15"
    fill="none"
    stroke="currentColor"
    stroke-width="1"
    stroke-linecap={linecap}
    class="shrink-0 {className}"
    aria-hidden={label ? undefined : 'true'}
    aria-label={label}
    role={label ? 'img' : undefined}
  >
    <path d={strokedPath} />
  </svg>
{/if}
