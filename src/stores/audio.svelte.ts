import type { Smol } from '../types/domain';
import { toTrack, trackKey, type Track } from '../utils/track';

type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
type QueueOptions = { id?: string; album?: string; wrap?: boolean };
type AudioSession = EventTarget & { readonly state: 'active' | 'inactive' | 'interrupted' };

const state = $state({
  ready: false,
  track: null as Track | null,
  queue: [] as Track[],
  queueId: undefined as string | undefined,
  index: -1,
  status: 'idle' as Status,
  buffering: false,
  currentTime: 0,
  duration: 0,
  seekable: false,
  message: '',
});
export const player: Readonly<typeof state> = state;

let audio: HTMLAudioElement | undefined;
let media: MediaSession | undefined;
let audioSession: AudioSession | undefined;
let queueOptions: QueueOptions = {};
let wantsPlayback = false;
let preventAutomaticResume = false;
let playRequest = 0;
let fallbackUsed = false;
let resumePosition: number | undefined;
let stallTimer: ReturnType<typeof setTimeout> | undefined;
const STALL_TIMEOUT = 12_000;

function syncTime() {
  if (!audio) return;
  state.duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  state.currentTime = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
  state.seekable = state.duration > 0 && audio.seekable.length > 0;
}

function syncPosition() {
  if (!audio || !media?.setPositionState) return;
  syncTime();
  const { duration, currentTime } = state;
  const playbackRate = audio.playbackRate;
  try {
    if (duration > 0 && Number.isFinite(playbackRate) && playbackRate > 0) {
      media.setPositionState({ duration, position: Math.min(currentTime, duration), playbackRate });
    } else {
      media.setPositionState();
    }
  } catch {
    // Some browsers expose only a subset of Media Session.
  }
}

function publishMetadata() {
  if (!media || typeof MediaMetadata === 'undefined') return;
  const track = state.track;
  media.metadata = track ? new MediaMetadata({
    title: track.title,
    artist: track.artist || 'SMOL',
    album: queueOptions.album || 'SMOL',
    artwork: [4, 8].map((scale) => ({
      src: `${track.coverUrl}?scale=${scale}`,
      sizes: `${scale * 64}x${scale * 64}`,
      type: 'image/png',
    })),
  }) : null;
}

function clearBuffering() {
  clearTimeout(stallTimer);
  stallTimer = undefined;
  state.buffering = false;
}

function requestPlay() {
  if (!audio || !state.track) return;
  const request = ++playRequest;
  // Keep this call in the originating gesture, remote action or ended event.
  void audio.play().catch((error: DOMException) => {
    if (request !== playRequest || !wantsPlayback) return;
    if (error.name === 'NotAllowedError') {
      fail('Tap Retry to start playback.');
    } else if (error.name === 'AbortError') {
      pause();
    } else {
      recover();
    }
  });
}

function loadSource(src: string, autoplay: boolean, position = 0) {
  if (!audio) return;
  ++playRequest;
  clearBuffering();
  wantsPlayback = autoplay;
  resumePosition = position > 0 ? position : undefined;
  state.status = autoplay ? 'loading' : 'paused';
  state.message = '';
  state.duration = 0;
  state.currentTime = 0;
  state.seekable = false;
  audio.src = src;
  audio.load();
  if (media) media.playbackState = 'paused';
  syncPosition();
  if (autoplay) requestPlay();
}

function fail(message: string) {
  ++playRequest;
  clearBuffering();
  wantsPlayback = false;
  audio?.pause();
  state.status = 'error';
  state.message = message;
  if (media) media.playbackState = 'paused';
  syncPosition();
}

function recover() {
  const track = state.track;
  if (!audio || !track || state.status === 'error') return;
  if (wantsPlayback && !fallbackUsed && track.fallbackSrc) {
    fallbackUsed = true;
    loadSource(track.fallbackSrc, true, resumePosition ?? state.currentTime);
  } else {
    fail('Playback couldn’t continue.');
  }
}

function handleBuffering() {
  if (!audio || !wantsPlayback || audio.paused || audio.ended || audio.readyState >= audio.HAVE_FUTURE_DATA) return;
  state.buffering = true;
  stallTimer ??= setTimeout(() => {
    stallTimer = undefined;
    if (audio && wantsPlayback && !audio.paused && audio.readyState < audio.HAVE_FUTURE_DATA) recover();
    else clearBuffering();
  }, STALL_TIMEOUT);
}

function applyResumePosition() {
  if (!audio || resumePosition === undefined || !audio.seekable.length) return;
  const position = resumePosition;
  resumePosition = undefined;
  seek(position);
}

function handlePause() {
  if (!audio?.paused || !state.track || state.status === 'error') return;
  ++playRequest;
  wantsPlayback = false;
  clearBuffering();
  state.status = 'paused';
  if (media) media.playbackState = 'paused';
  syncPosition();
}

function handlePlay() {
  if (!audio || audio.paused || !state.track) return;
  if (preventAutomaticResume) {
    pause();
    return;
  }
  wantsPlayback = true;
  if (media) media.playbackState = 'playing';
  syncPosition();
}

function handlePlaying() {
  if (!audio || audio.paused || !state.track || !wantsPlayback) return;
  clearBuffering();
  state.status = 'playing';
  if (media) media.playbackState = 'playing';
  syncPosition();
}

function handleEnded() {
  if (!audio?.ended || !state.track || !wantsPlayback) return;
  if (selectAdjacent(1)) return;
  wantsPlayback = false;
  clearBuffering();
  state.status = 'paused';
  if (media) media.playbackState = 'paused';
  syncPosition();
}

function watchAudioOutput(element: HTMLAudioElement) {
  const devices = navigator.mediaDevices;
  if (!devices?.enumerateDevices) return;
  let outputGroup: string | undefined;
  let revision = 0;

  async function refreshOutput() {
    const request = ++revision;
    try {
      const outputs = (await devices.enumerateDevices()).filter((device) => device.kind === 'audiooutput');
      if (revision !== request) return;
      const sinkId = element.sinkId || 'default';
      const selected = outputs.find((device) => device.deviceId === sinkId);
      // Only act on a known selected output. Browsers may redact output IDs and groups.
      const disconnected = outputGroup && !outputs.some((device) => device.groupId === outputGroup);
      outputGroup = selected?.groupId;
      if (disconnected && outputs.length && state.track) {
        preventAutomaticResume = true;
        pause();
      }
    } catch {
      // Where output identity is unavailable, follow the element's own pause event.
    }
  }

  void refreshOutput();
  devices.addEventListener('devicechange', refreshOutput);
}

export function attach(element: HTMLAudioElement) {
  if (audio) return;
  audio = element;
  media = navigator.mediaSession;
  audioSession = (navigator as Navigator & { audioSession?: AudioSession }).audioSession;

  element.addEventListener('play', handlePlay);
  element.addEventListener('playing', handlePlaying);
  element.addEventListener('pause', () => {
    // The browser also emits pause just before ended. Let ended advance the queue.
    if (!element.ended) handlePause();
  });
  element.addEventListener('ended', handleEnded);
  element.addEventListener('waiting', handleBuffering);
  element.addEventListener('stalled', handleBuffering);
  element.addEventListener('canplay', () => {
    clearBuffering();
    applyResumePosition();
    syncTime();
  });
  element.addEventListener('error', () => {
    if (element.error && state.track) recover();
  });
  element.addEventListener('timeupdate', syncTime);
  element.addEventListener('durationchange', syncPosition);
  element.addEventListener('loadedmetadata', () => {
    applyResumePosition();
    syncPosition();
  });
  element.addEventListener('seeked', syncPosition);
  element.addEventListener('ratechange', syncPosition);
  watchAudioOutput(element);

  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', play],
    ['pause', pause],
    ['previoustrack', previous],
    ['nexttrack', next],
    ['seekto', ({ seekTime }) => { if (seekTime !== undefined) seek(seekTime); }],
  ];
  for (const [action, handler] of actions) {
    try {
      media?.setActionHandler(action, handler);
    } catch {
      // An unsupported action must not prevent registration of the others.
    }
  }
  state.ready = true;
}

function select(index: number) {
  const track = state.queue[index];
  if (!track) return;
  state.index = index;
  state.track = track;
  fallbackUsed = false;
  preventAutomaticResume = false;
  publishMetadata();
  loadSource(track.src, true);
}

export function playQueue(tracks: readonly Track[], start: number, options: QueueOptions = {}) {
  if (!audio || !tracks[start]) return;
  state.queue = tracks.map((track) => ({ ...track }));
  queueOptions = { ...options };
  state.queueId = options.id;
  select(start);
}

export function playSmolQueue(smols: Smol[], smol: Smol, options?: QueueOptions) {
  if (!smol.Song_1) return;
  const key = trackKey(smol.Id, smol.Song_1);
  if (state.track?.key === key) {
    toggle();
    return;
  }
  const tracks = smols.map((item) => toTrack(item)).filter((track) => track !== null);
  playQueue(tracks, tracks.findIndex((track) => track.key === key), options);
}

export function updateTrack(track: Track) {
  const current = state.track;
  if (current?.key !== track.key) return;
  const sourceChanged = current.src !== track.src;
  if (!sourceChanged) {
    current.fallbackSrc ??= track.fallbackSrc;
    return;
  }
  const autoplay = wantsPlayback && !audio?.paused;
  const position = resumePosition ?? state.currentTime;
  current.src = track.src;
  current.fallbackSrc = track.fallbackSrc;
  fallbackUsed = false;
  loadSource(track.src, autoplay, position);
}

export function play() {
  if (!audio || !state.track || wantsPlayback) return;
  preventAutomaticResume = false;
  if (state.status === 'error') {
    fallbackUsed = false;
    loadSource(state.track.src, true, resumePosition ?? state.currentTime);
    return;
  }
  wantsPlayback = true;
  state.status = 'loading';
  requestPlay();
}

export function pause() {
  if (!audio || !state.track) return;
  if (audioSession?.state === 'interrupted') preventAutomaticResume = true;
  ++playRequest;
  wantsPlayback = false;
  audio.pause();
  handlePause();
}

export function toggle() {
  if (wantsPlayback) pause();
  else play();
}

function selectAdjacent(offset: number): boolean {
  const size = state.queue.length;
  if (!size) return false;
  const index = state.index + offset;
  if (!queueOptions.wrap && (index < 0 || index >= size)) return false;
  select((index + size) % size);
  return true;
}

export function next() { selectAdjacent(1); }
export function previous() { selectAdjacent(-1); }

export function seek(seconds: number) {
  if (!audio || !Number.isFinite(seconds) || !audio.seekable.length || !Number.isFinite(audio.duration)) return;
  const target = Math.max(0, Math.min(seconds, audio.duration));
  let nearest = audio.seekable.start(0);
  for (let i = 0; i < audio.seekable.length; i++) {
    const clamped = Math.max(audio.seekable.start(i), Math.min(target, audio.seekable.end(i)));
    if (Math.abs(target - clamped) < Math.abs(target - nearest)) nearest = clamped;
  }
  audio.currentTime = nearest;
  syncPosition();
}

export function stop() {
  if (!audio) return;
  ++playRequest;
  wantsPlayback = false;
  clearBuffering();
  resumePosition = undefined;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  Object.assign(state, {
    track: null, queue: [], queueId: undefined, index: -1, status: 'idle',
    currentTime: 0, duration: 0, seekable: false, message: '',
  });
  if (media) media.playbackState = 'none';
  publishMetadata();
  syncPosition();
}

export function setTrackLiked(smolId: string, liked: boolean) {
  for (const track of state.queue) {
    if (track.smolId === smolId) track.liked = liked;
  }
}
