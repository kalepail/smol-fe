import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = readFileSync(new URL('../fixtures/tone.mp3', import.meta.url));
const api = 'http://127.0.0.1:4329';
const actions = ['nexttrack', 'pause', 'play', 'previoustrack', 'seekto'];

declare global {
  interface Window {
    playbackTest: {
      handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>>;
      positions: MediaPositionState[];
      original?: HTMLAudioElement;
      ended: string[];
      swaps: { sameElement: boolean; paused: boolean }[];
    };
  }
}

async function remote(page: Page, action: MediaSessionAction, seekTime?: number) {
  await page.evaluate(({ action, seekTime }) => {
    window.playbackTest.handlers[action]!({ action, seekTime });
  }, { action, seekTime });
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const audio = document.querySelector('audio')!;
    const session = navigator.mediaSession;
    return {
      sameElement: audio === window.playbackTest.original,
      title: session.metadata?.title,
      artist: session.metadata?.artist,
      album: session.metadata?.album,
      artwork: session.metadata?.artwork.map(({ sizes, type }) => ({ sizes, type })),
      state: session.playbackState,
      paused: audio.paused,
      position: audio.currentTime,
      source: new URL(audio.src).pathname,
    };
  });
}

test('the persisted audio handles navigation, now playing sheet, natural advancement, remote actions and take retry', async ({ page }) => {
  await page.addInitScript(() => {
    window.playbackTest = { handlers: {}, positions: [], ended: [], swaps: [] };
    const setHandler = MediaSession.prototype.setActionHandler;
    MediaSession.prototype.setActionHandler = function (action, handler) {
      if (handler) window.playbackTest.handlers[action] = handler;
      else delete window.playbackTest.handlers[action];
      setHandler.call(this, action, handler);
    };
    const setPosition = MediaSession.prototype.setPositionState;
    MediaSession.prototype.setPositionState = function (position) {
      if (position) window.playbackTest.positions.push(position);
      setPosition.call(this, position);
    };
    document.addEventListener('playing', (event) => {
      const audio = event.target;
      if (audio instanceof HTMLAudioElement) window.playbackTest.original ??= audio;
    }, true);
    document.addEventListener('ended', (event) => {
      const audio = event.target;
      if (audio instanceof HTMLAudioElement) window.playbackTest.ended.push(new URL(audio.src).pathname);
    }, true);
    document.addEventListener('astro:after-swap', () => {
      const audio = document.querySelector('audio');
      if (audio) window.playbackTest.swaps.push({
        sameElement: audio === window.playbackTest.original,
        paused: audio.paused,
      });
    });
  });

  let allowAlternate = false;
  let fallbackRequests = 0;
  await page.route('**/song/*.mp3', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/alternate-fallback.mp3')) fallbackRequests++;
    if (!allowAlternate && path.includes('/alternate')) {
      await route.fulfill({ status: 503 });
      return;
    }
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const headers = { 'accept-ranges': 'bytes' };
    if (!range) {
      await route.fulfill({ headers, body: fixture, contentType: 'audio/mpeg' });
      return;
    }
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), fixture.length - 1) : fixture.length - 1;
    await route.fulfill({
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${fixture.length}` },
      body: fixture.subarray(start, end + 1),
      contentType: 'audio/mpeg',
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Play First Track' }).tap();
  const dock = page.getByRole('region', { name: 'Audio player' });
  await expect.poll(() => snapshot(page)).toMatchObject({
    sameElement: true, title: 'First Track', artist: 'Fixture Artist', album: 'SMOL',
    state: 'playing', paused: false, source: '/song/first.mp3',
    artwork: [
      { sizes: '256x256', type: 'image/png' },
      { sizes: '512x512', type: 'image/png' },
    ],
  });
  await remote(page, 'pause');
  await remote(page, 'pause');
  await expect.poll(() => snapshot(page)).toMatchObject({ state: 'paused', paused: true });
  await expect(dock.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await remote(page, 'seekto', 0.3);
  await expect.poll(async () => (await snapshot(page)).position).toBeCloseTo(0.3, 1);
  await remote(page, 'play');
  await remote(page, 'play');
  await expect.poll(() => snapshot(page)).toMatchObject({ state: 'playing', paused: false });

  // Expand NowPlayingSheet from mobile mini player and navigate to the song page.
  await dock.getByRole('button', { name: 'Open now playing for First Track' }).tap();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('heading', { name: 'Now playing' })).toBeVisible();
  await expect(page.locator('audio')).toHaveCount(1);
  await sheet.getByRole('link', { name: 'First Track' }).click();
  await expect(page).toHaveURL('/first-smol');
  await expect(page.getByRole('button', { name: 'Play take 2' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Mixtapes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mixtapes', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(window.playbackTest.handlers).sort())).toEqual(actions);
  expect(await page.evaluate(() => window.playbackTest.swaps)).toEqual([
    { sameElement: true, paused: false },
    { sameElement: true, paused: false },
  ]);
  await expect.poll(() => page.evaluate(() => window.playbackTest.ended.slice(0, 2))).toEqual([
    '/song/first.mp3', '/song/second.mp3',
  ]);
  await expect.poll(() => snapshot(page)).toMatchObject({ sameElement: true, title: 'Third Track', paused: false });

  await page.getByRole('link', { name: 'SMOL', exact: true }).click();
  await expect(page).toHaveURL('/');
  await remote(page, 'pause');
  await remote(page, 'nexttrack');
  await expect.poll(() => snapshot(page)).toMatchObject({ title: 'Neon Arcade Runner', paused: false });
  await remote(page, 'previoustrack');
  await expect.poll(() => snapshot(page)).toMatchObject({ title: 'Third Track', paused: false });
  await page.evaluate(() => document.querySelector('audio')!.pause());
  await expect.poll(() => snapshot(page)).toMatchObject({ state: 'paused', paused: true });

  const positions = await page.evaluate(() => window.playbackTest.positions);
  expect(positions.length).toBeGreaterThan(0);
  for (const { position, duration, playbackRate } of positions) {
    expect(Number.isFinite(duration) && duration! > 0).toBe(true);
    expect(Number.isFinite(position) && position! >= 0 && position! <= duration!).toBe(true);
    expect(Number.isFinite(playbackRate) && playbackRate! > 0).toBe(true);
  }

  await page.locator('a[href="/first-smol"]').first().click();
  await page.getByRole('button', { name: 'Play take 1' }).tap();
  await expect.poll(() => snapshot(page)).toMatchObject({ source: '/song/first.mp3', paused: false });
  await page.getByRole('button', { name: 'Play take 2' }).tap();
  await expect(dock.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(dock.getByRole('status')).toHaveText('Playback couldn’t continue.');
  expect(fallbackRequests).toBe(1);
  allowAlternate = true;
  await dock.getByRole('button', { name: 'Retry', exact: true }).tap();
  await expect.poll(() => snapshot(page)).toMatchObject({
    sameElement: true, source: '/song/alternate.mp3', state: 'playing', paused: false,
  });
  await expect(page.locator('audio')).toHaveCount(1);
  await expect.poll(() => snapshot(page)).toMatchObject({ state: 'paused', paused: true });

  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Mixtapes', exact: true }).click();
  await page.getByRole('link', { name: /Fixture Mixtape/ }).click();
  await page.getByRole('button', { name: 'Play All' }).tap();
  await expect.poll(() => snapshot(page)).toMatchObject({
    sameElement: true, title: 'First Track', album: 'Fixture Mixtape', paused: false,
  });
  await page.getByRole('button', { name: 'Stop Playing' }).tap();
  await expect(dock).toHaveCount(0);
  expect(await page.evaluate(() => ({
    state: navigator.mediaSession.playbackState,
    metadata: navigator.mediaSession.metadata,
    src: document.querySelector('audio')?.getAttribute('src'),
  }))).toEqual({ state: 'none', metadata: null, src: null });
});

test('song, mixtape, artist and playlist islands reuse their single SSR response (G3)', async ({ page, request }) => {
  await request.post(`${api}/__reset`);
  await page.goto('/first-smol');
  await expect(page.getByRole('button', { name: 'Play take 1' })).toBeVisible();
  await page.goto('/mixtapes/fixture-mixtape');
  await expect(page.getByRole('button', { name: 'Play All' })).toBeEnabled();
  await page.goto('/artists/fixture-artist');
  await expect(page.getByRole('heading', { name: 'Fixture Artist' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
  await page.goto('/playlist/arcade');
  await expect(page.getByRole('heading', { name: 'arcade' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();

  const counts = await (await request.get(`${api}/__requests`)).json();
  expect(counts).toMatchObject({
    '/first-smol': 1,
    '/mixtapes/fixture-mixtape': 1,
    '/artists/fixture-artist/smols': 1,
    '/playlist/arcade': 1,
  });
});

test('Q11 play beacon fires POST /plays/:musicId once after 4s real cumulative playback and survives pause/resume/scrub', async ({
  page,
}) => {
  // Strip the 45-byte ID3v2 header + 182-byte Info frame from tone.mp3 and repeat pure MPEG frames (~10s).
  const rawFrames = fixture.subarray(227);
  const longFixture = Buffer.concat(Array.from({ length: 5 }, () => rawFrames));

  await page.route('**/song/*.mp3', async (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const headers = { 'accept-ranges': 'bytes' };
    if (!range) {
      await route.fulfill({ headers, body: longFixture, contentType: 'audio/mpeg' });
      return;
    }
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), longFixture.length - 1) : longFixture.length - 1;
    await route.fulfill({
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${longFixture.length}` },
      body: longFixture.subarray(start, end + 1),
      contentType: 'audio/mpeg',
    });
  });

  const beaconRequests: { url: string; method: string }[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // Verify fail-silent behavior even if the backend returns 500 on POST /plays/:musicId
  await page.route('**/plays/*', async (route) => {
    beaconRequests.push({ url: route.request().url(), method: route.request().method() });
    await route.fulfill({
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: 'transient error',
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Play First Track' }).tap();
  await expect.poll(async () => page.evaluate(() => {
    const a = document.querySelector('audio');
    return Boolean(a && !a.paused && a.currentTime > 0);
  })).toBe(true);

  // Play ~2.0s -> below 4s threshold, 0 beacons
  await page.waitForTimeout(2000);
  expect(beaconRequests).toHaveLength(0);

  // Pause for 2.2s -> wall clock > 4.2s, cumulative playback still ~2.0s -> 0 beacons
  await page.evaluate(() => document.querySelector('audio')!.pause());
  await page.waitForTimeout(2200);
  expect(beaconRequests).toHaveLength(0);

  // Scrub forward past 4s while paused -> scrubbing must NOT trigger beacon
  await page.evaluate(() => {
    const a = document.querySelector('audio')!;
    a.currentTime = Math.min(5, Math.max(0, a.duration - 1));
  });
  await page.waitForTimeout(400);
  expect(beaconRequests).toHaveLength(0);

  // Seek back to 0.5s and resume -> crossing 4s real cumulative playback fires ONCE
  await page.evaluate(() => {
    const a = document.querySelector('audio')!;
    a.currentTime = 0.5;
    return a.play();
  });

  await expect.poll(() => beaconRequests.length, { timeout: 4500 }).toBe(1);
  expect(beaconRequests[0]).toMatchObject({
    method: 'POST',
    url: `${api}/plays/first`,
  });

  // Pause, scrub, resume and continue playing -> strictly deduplicated per session (still 1)
  await page.evaluate(() => {
    const a = document.querySelector('audio')!;
    a.pause();
    a.currentTime = 1.5;
    return a.play();
  });
  await page.waitForTimeout(1500);
  expect(beaconRequests).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});
