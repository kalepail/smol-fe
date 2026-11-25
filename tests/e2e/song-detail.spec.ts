import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const api = 'http://127.0.0.1:4329';
const renderDir = process.env.SMOL_SONG_RENDER_DIR || '';

function fakeSmolJwt(sub = 'CFIXTUREUSER0000000000000000000000000000000000000000000001') {
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, key: 'fixture-key-id', exp: 2000000000 })}.sig`;
}

async function capture(page: Page, name: string, fullPage = true) {
  if (!renderDir) return;
  mkdirSync(renderDir, { recursive: true });
  await page.screenshot({ path: path.join(renderDir, name), fullPage, animations: 'disabled' });
}

async function assertNoOverflow(page: Page, expectedWidth: number, label: string) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(expectedWidth + 1);
}

async function assertActionRowSingleLine(page: Page, label: string) {
  const tops = await page.evaluate(() => {
    const row = document.querySelector('[data-song-actions]');
    if (!row) return [] as number[];
    const items = Array.from(row.children).filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && el.getBoundingClientRect().width > 0;
    });
    return items.map((el) => Math.round(el.getBoundingClientRect().top));
  });
  expect(tops.length, `${label}: action items present`).toBeGreaterThan(0);
  const spread = Math.max(...tops) - Math.min(...tops);
  expect(spread, `${label}: action bar must stay on one row`).toBeLessThanOrEqual(6);
}

const VIEWPORTS = [
  { tag: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { tag: 'tablet', width: 768, height: 1024, isMobile: false, hasTouch: false },
  { tag: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { tag: 'small', width: 375, height: 812, isMobile: true, hasTouch: true },
  { tag: 'compact', width: 360, height: 800, isMobile: true, hasTouch: true },
  { tag: 'narrow', width: 320, height: 640, isMobile: true, hasTouch: true },
];

for (const vp of VIEWPORTS) {
  test.describe(`Song detail lifecycle (${vp.tag} ${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });

    test('completed vocal 2-take (owner): single-row actions down to 320px, responsive grid, minimal Lyrics + Drawer, clean Details', async ({
      page,
      context,
    }) => {
      await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);
      await page.goto('/smol-2take');

      await expect(page.getByRole('heading', { name: 'Neon Arcade Runner' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'More like this' })).toBeVisible();
      await assertNoOverflow(page, vp.width, `${vp.tag}: /smol-2take`);
      await assertActionRowSingleLine(page, `${vp.tag}: /smol-2take`);

      const details = page.locator('aside[aria-labelledby="song-details-heading"]');
      if (vp.width >= 1024) {
        await expect(details).toContainText('Plays');
        await expect(details).toContainText('55');
        await expect(details).toContainText('Public');
        await expect(details).toContainText('Classic');
        // D8: Clean songs omit the "Safety: Safe" noise row
        await expect(details).not.toContainText('Safety');
      } else {
        const toggleBtn = details.getByRole('button', { name: /Details/ });
        await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
        // D2: Summary leads with plays and omits duplicate model chip
        await expect(toggleBtn).toContainText('55 plays · Public');
        await expect(toggleBtn).not.toContainText('Classic');
      }

      const art = page.locator('article img.pixelated').first();
      const collectible = page.locator('section[aria-label="Collectible"]');
      const lyricsPreview = page.locator('#song-lyrics');
      const [artBox, detailsBox, collectibleBox, lyricsBox] = await Promise.all([
        art.boundingBox(),
        details.boundingBox(),
        collectible.boundingBox(),
        lyricsPreview.boundingBox(),
      ]);
      expect(artBox && detailsBox && collectibleBox && lyricsBox).toBeTruthy();
      expect(lyricsBox!.y).toBeGreaterThan(collectibleBox!.y);

      if (vp.width >= 1024) {
        expect(Math.abs(detailsBox!.x - artBox!.x)).toBeLessThanOrEqual(4);
        expect(detailsBox!.y).toBeGreaterThan(artBox!.y + artBox!.height - 2);
        expect(detailsBox!.x + detailsBox!.width).toBeLessThan(collectibleBox!.x);
      } else if (vp.width >= 768) {
        // D6: At tablet 768px, cover art & main sit side-by-side (224px cover like MixtapeHeader), Details spans below
        expect(artBox!.x + artBox!.width).toBeLessThan(collectibleBox!.x);
        expect(detailsBox!.y).toBeGreaterThan(lyricsBox!.y);
      } else {
        expect(detailsBox!.y).toBeGreaterThan(lyricsBox!.y);
      }

      // Style tags capped at 8 with >=44px +2 more toggle
      const moreTagsBtn = page.getByRole('button', { name: '+2 more' });
      await expect(moreTagsBtn).toBeVisible();
      const tagBtnBox = await moreTagsBtn.boundingBox();
      expect(tagBtnBox!.height).toBeGreaterThanOrEqual(44);
      await moreTagsBtn.click();
      await expect(page.getByText('High Energy', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Show fewer' }).click();

      await page.evaluate(() => window.scrollTo(0, 0));
      if (vp.tag === 'desktop' || vp.tag === 'tablet' || vp.tag === 'small') {
        await capture(page, `song-2take-owner-${vp.tag}.png`);
      }
      if (vp.tag === 'desktop' || vp.tag === 'tablet' || vp.tag === 'mobile') {
        await capture(page, `song-2take-owner-${vp.tag}-viewport.png`, false);
      }
      if (vp.tag === 'mobile') {
        await capture(page, 'song-2take-owner-mobile.png', true);
      }

      if (vp.width < 1024) {
        const toggleBtn = details.getByRole('button', { name: /Details/ });
        await toggleBtn.click();
        await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
        await expect(details).toContainText('smol-2take');
        await expect(details).not.toContainText('Safety');
      }

      // D3: Minimal Lyrics preview card has single "Show all 10 lines" button (no redundant Copy/Read lyrics)
      await expect(lyricsPreview.getByRole('button', { name: 'Copy' })).toHaveCount(0);
      await lyricsPreview.getByRole('button', { name: 'Show all 10 lines' }).click();
      const drawer = page.locator('dialog[open]');
      await expect(drawer).toHaveAttribute('aria-labelledby', /.+/);
      await expect(drawer.getByRole('heading', { name: 'Lyrics', exact: true })).toBeVisible();
      await expect(drawer).toContainText('Verse 1');
      await expect(drawer).toContainText('Chorus');
      await expect(drawer).toContainText('Pixel skies above the street');
      await expect(drawer.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

      if (vp.tag === 'desktop' || vp.tag === 'mobile') {
        await capture(page, `song-lyrics-drawer-${vp.tag}.png`, false);
      }

      // P1-2 regression (desktop): drag-out keeps drawer open; plain backdrop click closes it
      if (vp.tag === 'desktop') {
        const firstLine = drawer.getByText('Coins drop slow in the midnight glow');
        const lineBox = await firstLine.boundingBox();
        expect(lineBox).toBeTruthy();
        await page.mouse.move(lineBox!.x + 40, lineBox!.y + 8);
        await page.mouse.down();
        await page.mouse.move(100, lineBox!.y + 8, { steps: 5 });
        await page.mouse.up();
        await expect(page.locator('dialog[open]')).toHaveCount(1);

        await page.mouse.click(100, 200);
        await expect(page.locator('dialog[open]')).toHaveCount(0);

        await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
        await expect(drawer.getByRole('heading', { name: 'Lyrics', exact: true })).toBeVisible();
      }

      await drawer.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Lyrics copied.' })).toBeVisible();
      await drawer.getByRole('button', { name: 'Close' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    });

    if (vp.tag === 'desktop' || vp.tag === 'tablet' || vp.tag === 'mobile') {
      test('non-owner signed-in visitor and signed-out visitor both hide owner controls cleanly', async ({
        page,
        context,
      }) => {
        await page.goto('/smol-2take');
        await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Lyrics', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Mint', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add to mixtape' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Use as main take' })).toHaveCount(0);

        await context.addCookies([
          {
            name: 'smol_token',
            value: fakeSmolJwt('COTHERUSER000000000000000000000000000000000000000000000099'),
            url: 'http://127.0.0.1:4328',
          },
        ]);
        await page.goto('/smol-2take');
        await expect(page.getByRole('button', { name: 'Play take 1' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Play take 2' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Use as main take' })).toHaveCount(0);

        await page.getByRole('button', { name: 'More options' }).click();
        const moreSheet = page.locator('dialog[open]');
        await expect(moreSheet.getByRole('button', { name: 'Add to mixtape' })).toBeVisible();
        await expect(moreSheet.getByRole('button', { name: 'Share song' })).toBeVisible();
        await expect(moreSheet.getByRole('button', { name: 'Copy song link' })).toBeVisible();
        await expect(moreSheet.getByRole('button', { name: 'Remix prompt' })).toBeVisible();
        await expect(moreSheet.getByRole('button', { name: 'Delete song' })).toHaveCount(0);
        await expect(moreSheet.getByRole('button', { name: 'Make private' })).toHaveCount(0);
        await moreSheet.getByRole('button', { name: 'Close' }).click();
      });

      test('private song (Publish to mint), flagged NSFW, active generation stages, sanitized failures, and 404 Browse songs', async ({
        page,
        context,
        request,
      }) => {
        await request.get(`${api}/__reset`);
        await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);

        // 1. Private published song: banner above grid + D5 "Publish to mint" (not Mint!) + no Show-all button when 4 lines fit
        await page.goto('/smol-private');
        await expect(
          page.getByText('Private · Hidden from feeds and search. Anyone with the link can listen.')
        ).toBeVisible();
        const collectPriv = page.locator('section[aria-label="Collectible"]');
        await expect(collectPriv).toContainText('Publish to mint');
        await expect(collectPriv.getByRole('button')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Publish to feed' })).toHaveCount(1);
        await expect(page.locator('#song-lyrics').getByRole('button')).toHaveCount(0);
        const detailsPriv = page.locator('aside[aria-labelledby="song-details-heading"]');
        await expect(detailsPriv).toContainText('Private');
        await expect(page.getByRole('heading', { name: 'More like this' })).toHaveCount(0);
        if (vp.tag === 'desktop' || vp.tag === 'mobile') {
          await capture(page, `song-private-owner-${vp.tag}.png`);
        }
        await page.getByRole('button', { name: 'Publish to feed' }).click();
        await expect.poll(async () => (await (await request.get(`${api}/__mutations`)).json()).publishCalls).toEqual([
          '/smol-private',
        ]);
        await expect(detailsPriv).toContainText('Public');
        await expect(collectPriv.getByRole('button', { name: 'Mint', exact: true })).toBeVisible();

        // 2. Flagged / NSFW song: cover art stays visible, danger banner above grid, no duplicate Flagged chip, no Mint/Publish/Mixtape/More like this
        await page.goto('/smol-flagged');
        await expect(page.locator('article img.pixelated').first()).toBeVisible();
        await expect(page.getByText(/Flagged for sensitive content \(explicit\)/)).toBeVisible();
        await expect(page.locator('article header').getByText('Flagged', { exact: true })).toHaveCount(0);
        await expect(page.locator('section[aria-label="Collectible"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Publish to feed' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Add to mixtape' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'More like this' })).toHaveCount(0);
        await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Flagged');
        await assertNoOverflow(page, vp.width, `${vp.tag}: /smol-flagged`);
        if (vp.tag === 'desktop' || vp.tag === 'mobile') {
          await capture(page, `song-flagged-${vp.tag}.png`);
        }

        // 3. Early generating (private): accurate Visibility: Private (F3), ETA shown (S5b), Remix hidden (S5a)
        await page.goto('/smol-generating-early');
        await expect(page.getByRole('heading', { name: 'Creating your song…' })).toBeVisible();
        await expect(page.locator('section[aria-label="Generation progress"]')).toContainText('Usually 2–6 min');
        await expect(page.getByRole('button', { name: 'Remix prompt' })).toHaveCount(0);
        await expect(page.getByText('Private sunrise ambient arpeggios with soft tape flutter')).toBeVisible();
        await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Private');
        await expect(page.locator('section[aria-label="Collectible"]')).toHaveCount(0);
        await assertNoOverflow(page, vp.width, `${vp.tag}: /smol-generating-early`);
        if (vp.tag === 'desktop' || vp.tag === 'mobile') {
          await capture(page, `song-generating-early-${vp.tag}.png`);
        }

        // 4. Partial generating (vocal, lyrics + Take 1 ready): Lyrics drawer readable while recording + Take 1 playable
        await page.goto('/smol-generating-partial');
        await expect(page.getByRole('heading', { name: 'Rings of Static' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Play take 1' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Remix prompt' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
        const genDrawer = page.locator('dialog[open]');
        await expect(genDrawer).toContainText('Audio is still recording');
        await expect(genDrawer).toContainText('Floating past the silver ice');
        await genDrawer.getByRole('button', { name: 'Close' }).click();
        if (vp.tag === 'desktop' || vp.tag === 'mobile') {
          await capture(page, `song-generating-partial-${vp.tag}.png`);
        }

        // 5. Failed generation with internal config leak: integrated in main column, no dead Play button, no CF_AI_GATEWAY_ID leak
        await page.goto('/smol-failed-config');
        const alertBox = page.locator('section[aria-label="Generation failed"]');
        await expect(alertBox).toBeVisible();
        await expect(alertBox).not.toContainText('CF_AI_GATEWAY_ID');
        await expect(alertBox).not.toContainText('CF_AIG_TOKEN');
        await expect(alertBox).toContainText(/temporarily unavailable/i);
        // F2: a dead model is not retryable, but suggestAlternate still offers the other model.
        await expect(alertBox.getByRole('button', { name: 'Try again' })).toHaveCount(0);
        await expect(alertBox.getByRole('button', { name: 'Try with Classic' })).toBeVisible();
        await expect(alertBox.getByRole('button', { name: 'Edit prompt' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
        await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Private');
        await assertNoOverflow(page, vp.width, `${vp.tag}: /smol-failed-config`);
        if (vp.tag === 'desktop' || vp.tag === 'mobile') {
          await capture(page, `song-failed-${vp.tag}.png`);
        }

        // 6. S3: 404 not-found renders "Song not found" + "Browse songs" link (not dead-end "Try again")
        // F6: an authoritative API 404 is a real HTTP 404.
        expect((await page.goto('/does-not-exist-404'))?.status()).toBe(404);
        await expect(page.getByRole('heading', { name: 'Song not found' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Browse songs' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
        await assertNoOverflow(page, vp.width, `${vp.tag}: /does-not-exist-404`);

        // 7. Cross-page sync checks: Mixtape header Share + Artist page header Share/Copy
        await page.goto('/mixtapes/fixture-mixtape');
        await expect(page.getByRole('button', { name: 'Share mixtape' })).toBeVisible();
        await assertNoOverflow(page, vp.width, `${vp.tag}: /mixtapes/fixture-mixtape`);

        await page.goto('/artists/fixture-artist');
        await expect(page.getByRole('heading', { name: 'Fixture Artist' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Share artist' })).toBeVisible();
        await assertNoOverflow(page, vp.width, `${vp.tag}: /artists/fixture-artist`);
      });
    }
  });
}

test.describe('Fable Report 36 & 37 edge-case regressions', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('P1-1: partial Classic polling stays active while running, then stops cleanly when published with 1 take (no wf)', async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);

    let polls = 0;
    await page.route(`${api}/smol-generating-partial`, async (route) => {
      polls++;
      const headers = {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
        'Access-Control-Allow-Credentials': 'true',
      };
      if (polls === 1) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          d1: {
            Id: 'smol-generating-partial',
            Title: 'Rings of Static',
            Address: 'CFIXTUREUSER0000000000000000000000000000000000000000000001',
            Username: 'Fixture Artist',
            Song_1: 'first',
            Song_2: null,
            Public: 0,
            Instrumental: 0,
            Created_At: '2026-11-23T18:00:00Z',
            Requested_Provider: 'aisonggenerator',
            Actual_Provider: 'aisonggenerator',
          },
          kv_do: {
            payload: {
              address: 'CFIXTUREUSER0000000000000000000000000000000000000000000001',
              prompt: 'Dreamy space synth ballad',
              instrumental: false,
              public: false,
              provider: 'aisonggenerator',
            },
            image: true,
            nsfw: { safe: true, categories: [] },
            lyrics: { title: 'Rings of Static', style: ['Dream Pop'], lyrics: '[Verse 1]\nFloating past the silver ice' },
            songs: [{ music_id: 'first', status: 4, audio: `${api}/song/first.mp3` }],
          },
          liked: false,
        }),
      });
    });

    await page.goto('/smol-generating-partial');
    await expect(page.getByText('Generating', { exact: true })).toBeVisible();

    await expect(page.locator('section[aria-label="Collectible"]')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('Generating', { exact: true })).toHaveCount(0);
    await expect(page.getByText('1 of 2 takes finished.')).toBeVisible();

    const pollsAfterPublish = polls;
    await page.waitForTimeout(8000);
    expect(polls).toBe(pollsAfterPublish);
  });

  test('S2 + S7: playing Take 2 syncs Hero & Lyrics drawer Pause button; dock Lyrics icon opens Now Playing with lyrics expanded', async ({
    page,
    context,
  }) => {
    const toneMp3 = readFileSync(new URL('../fixtures/tone.mp3', import.meta.url));
    const longMp3 = Buffer.concat(Array.from({ length: 5 }, () => toneMp3.subarray(227)));
    await page.route('**/song/*.mp3', async (route) => {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      const headers = { 'accept-ranges': 'bytes' };
      if (!range) {
        await route.fulfill({ headers, body: longMp3, contentType: 'audio/mpeg' });
        return;
      }
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), longMp3.length - 1) : longMp3.length - 1;
      await route.fulfill({
        status: 206,
        headers: { ...headers, 'content-range': `bytes ${start}-${end}/${longMp3.length}` },
        body: longMp3.subarray(start, end + 1),
        contentType: 'audio/mpeg',
      });
    });
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);
    await page.goto('/smol-2take');

    // Play Take 2 (non-main take)
    await page.getByRole('button', { name: 'Play take 2' }).click();
    await expect(page.locator('[data-song-actions]').getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    // Open Lyrics drawer -> footer shows Pause (not Play) and pauses Take 2 without restarting Take 1
    await page.locator('#main').getByRole('button', { name: 'Lyrics', exact: true }).click();
    const drawer = page.locator('dialog[open]');
    const drawerPause = drawer.getByRole('button', { name: 'Pause', exact: true });
    await expect(drawerPause).toBeVisible();
    await drawerPause.click();
    await expect(drawer.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Close' }).click();

    // S7 / D7-B: Clicking Lyrics icon in PlayerDock opens Now Playing with lyrics already expanded
    const dock = page.getByRole('region', { name: 'Audio player' });
    await dock.getByRole('button', { name: 'Lyrics', exact: true }).click();
    const nowPlaying = page.locator('dialog[open]');
    await expect(nowPlaying.getByRole('heading', { name: 'Now playing' })).toBeVisible();
    await expect(nowPlaying).toContainText('Coins drop slow in the midnight glow');
    await nowPlaying.getByRole('button', { name: 'Close' }).click();

    // N2: Reopening via Expand player starts with lyrics collapsed
    await dock.getByRole('button', { name: 'Expand player', exact: true }).click();
    await expect(nowPlaying.getByRole('heading', { name: 'Now playing' })).toBeVisible();
    await expect(nowPlaying).not.toContainText('Coins drop slow in the midnight glow');
    await nowPlaying.getByRole('button', { name: 'Close' }).click();
  });

  test('N1 + A1: dock Lyrics failing fetch fires exactly 1 request with working Try again; minted owner song hides Make private', async ({
    page,
    context,
  }) => {
    const toneMp3 = readFileSync(new URL('../fixtures/tone.mp3', import.meta.url));
    const longMp3 = Buffer.concat(Array.from({ length: 5 }, () => toneMp3.subarray(227)));
    await page.route('**/song/*.mp3', async (route) => {
      await route.fulfill({ headers: { 'accept-ranges': 'bytes' }, body: longMp3, contentType: 'audio/mpeg' });
    });
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);

    // A1: Minted public song owned by user hides "Make private" in More sheet
    await page.goto('/smol-minted');
    await page.getByRole('button', { name: 'More options' }).click();
    const moreSheet = page.locator('dialog[open]');
    await expect(moreSheet).toBeVisible();
    await expect(moreSheet.getByRole('button', { name: 'Make private' })).toHaveCount(0);
    await moreSheet.getByRole('button', { name: 'Close' }).click();

    // N1: Start playing smol-2take, then fail client GET /smol-2take -> dock Lyrics icon must NOT loop
    await page.goto('/smol-2take');
    await page.locator('[data-song-actions]').getByRole('button', { name: 'Play', exact: true }).click();
    const dock = page.getByRole('region', { name: 'Audio player' });
    await expect(dock.getByRole('button', { name: 'Lyrics', exact: true })).toBeVisible();

    let lyricsFetches = 0;
    let shouldFail = true;
    await page.route(`${api}/smol-2take`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      lyricsFetches++;
      if (shouldFail) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
      } else {
        await route.continue();
      }
    });

    await dock.getByRole('button', { name: 'Lyrics', exact: true }).click();
    const nowPlaying = page.locator('dialog[open]');
    await expect(nowPlaying.getByText('Could not load lyrics.')).toBeVisible();
    await page.waitForTimeout(1200);
    expect(lyricsFetches, 'N1: must not refetch in an unbounded loop on error').toBe(1);

    // Retry succeeds cleanly with exactly 1 additional request
    shouldFail = false;
    await nowPlaying.getByRole('button', { name: 'Try again' }).click();
    await expect(nowPlaying).toContainText('Coins drop slow in the midnight glow');
    expect(lyricsFetches).toBe(2);
    await nowPlaying.getByRole('button', { name: 'Close' }).click();
  });

  test('P2-3, P2-5, P2-10 & safety-unverified capture: nsfw unknown shows unverified (not Flagged), duplicate tags deduped, 100-char unbroken tokens wrap', async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);

    // Clean safety-unverified render capture (realistic copy)
    await page.route(`${api}/smol-unverified`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          d1: {
            Id: 'smol-unverified',
            Title: 'Signal In The Fog',
            Address: 'CFIXTUREUSER0000000000000000000000000000000000000000000001',
            Username: 'Fixture Artist',
            Song_1: 'first',
            Public: 0,
            Instrumental: 0,
            Created_At: '2026-11-23T18:00:00Z',
            Requested_Provider: 'elevenlabs',
            Actual_Provider: 'elevenlabs',
          },
          kv_do: {
            payload: {
              address: 'CFIXTUREUSER0000000000000000000000000000000000000000000001',
              prompt: 'Ambient synth pulse drifting through harbor fog',
              instrumental: false,
              public: false,
              provider: 'elevenlabs',
            },
            description: 'A misty pixel lighthouse glowing over dark water.',
            image: true,
            nsfw: { safe: false, categories: [], unknown: true },
            lyrics: {
              title: 'Signal In The Fog',
              style: ['Ambient', 'Synth'],
              lyrics: '[Verse 1]\nBeacon turning through the mist\nQuiet echoes on the drift',
            },
            songs: [{ music_id: 'first', status: 4, audio: `${api}/song/first.mp3` }],
          },
          liked: false,
        }),
      });
    });

    await page.goto('/smol-unverified');
    await expect(page.getByText(/Safety check didn't complete/)).toBeVisible();
    await expect(page.getByText(/Flagged for sensitive content/)).toHaveCount(0);
    await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Unverified');
    await capture(page, 'song-safety-unverified-desktop.png', false);

    // Unbroken 100-char token + duplicate tags check at mobile 390px
    await page.setViewportSize({ width: 390, height: 844 });
    const longToken = 'https://example.com/' + 'a'.repeat(100);
    await page.route(`${api}/smol-edge`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          d1: {
            Id: 'smol-edge',
            Title: longToken,
            Address: 'CFIXTUREUSER0000000000000000000000000000000000000000000001',
            Username: 'Fixture Artist',
            Song_1: 'first',
            Public: 0,
            Instrumental: 0,
            Created_At: '2026-11-23T18:00:00Z',
            Requested_Provider: 'elevenlabs',
            Actual_Provider: 'elevenlabs',
          },
          kv_do: {
            payload: {
              address: 'CFIXTUREUSER0000000000000000000000000000000000000000000001',
              prompt: `Track inspired by ${longToken}`,
              instrumental: false,
              public: false,
              provider: 'elevenlabs',
            },
            description: `Artwork featuring ${longToken}`,
            image: true,
            nsfw: { safe: false, categories: [], unknown: true },
            lyrics: {
              title: longToken,
              style: ['Pop', 'pop', 'Pop', 'Rock'],
              lyrics: `[Verse 1]\n${longToken}\nRegular line`,
            },
            songs: [{ music_id: 'first', status: 4, audio: `${api}/song/first.mp3` }],
          },
          liked: false,
        }),
      });
    });

    await page.goto('/smol-edge');
    await expect(page.locator('[aria-label="Style tags"]')).toContainText('Pop');
    await expect(page.locator('[aria-label="Style tags"]')).toContainText('Rock');
    await assertNoOverflow(page, 390, 'mobile 390: long unbroken token');

    await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
    const drawerOverflow = await page.evaluate(() => {
      const body = document.querySelector('[data-lyrics-body]');
      return body ? body.scrollWidth - body.clientWidth : -1;
    });
    expect(drawerOverflow).toBeLessThanOrEqual(1);
  });
});

test.describe('AE-3 song page robots', () => {
  const robotsOf = async (res: { status(): number; text(): Promise<string> }) => {
    expect(res.status()).toBe(200);
    return (await res.text()).match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? null;
  };
  // The dev server can't be reached AS smol.xyz; PUBLIC_E2E_SEAMS builds accept
  // this header in place of the hostname for the robots policy only.
  const production = { headers: { 'x-smol-e2e-host': 'smol.xyz' } };

  test('private, flagged and unpublished songs are noindex, nofollow even on smol.xyz; public songs stay indexable', async ({
    request,
    page,
  }) => {
    expect(await robotsOf(await request.get('/smol-private', production))).toBe('noindex, nofollow');
    expect(await robotsOf(await request.get('/smol-flagged', production))).toBe('noindex, nofollow');
    expect(await robotsOf(await request.get('/smol-generating', production))).toBe('noindex, nofollow');
    expect(await robotsOf(await request.get('/smol-minted', production))).toBe('index, follow');
    expect(await robotsOf(await request.get('/smol-1take', production))).toBe('index, follow');

    // Every non-production host (next.smol.xyz, previews, local) is noindex, nofollow globally.
    expect(await robotsOf(await request.get('/smol-minted', { headers: { 'x-smol-e2e-host': 'next.smol.xyz' } }))).toBe(
      'noindex, nofollow'
    );
    await page.goto('/smol-private');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
  });

  test('SSR uses CURRENT D1 visibility and the UI safety predicate (published-after-private, safety unknown)', async ({
    request,
    page,
  }) => {
    // Generated private, published later: D1 Public = 1, payload.public = false, safe.
    expect(await robotsOf(await request.get('/smol-published-was-private', production))).toBe('index, follow');
    // Published, but the safety check could not decide (`unknown: true`, no `safe`).
    expect(await robotsOf(await request.get('/smol-safety-unknown', production))).toBe('noindex, nofollow');
    // Still never indexable off production.
    expect(
      await robotsOf(await request.get('/smol-published-was-private', { headers: { 'x-smol-e2e-host': 'next.smol.xyz' } }))
    ).toBe('noindex, nofollow');

    // The UI agrees: the unknown-safety song renders as restricted, and Details never says Public (AE-2).
    await page.goto('/smol-safety-unknown');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByText("Safety check didn't complete. Kept private from public feeds.")).toBeVisible();
    await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Private');
  });

  test('F6 unknown song ids are a real 404 + noindex, nofollow on smol.xyz', async ({ request, page, context }) => {
    const res = await request.get('/does-not-exist-404', production);
    expect(res.status()).toBe(404);
    expect((await res.text()).match(/<meta name="robots" content="([^"]*)"/)?.[1]).toBe('noindex, nofollow');

    // Hydrated visit to a rejected non-song path (e.g. `/quota`, which collides with an API
    // endpoint) stays on "Song not found" and makes zero client song-detail requests.
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);
    const quotaFetches: string[] = [];
    await page.route(`${api}/quota`, async (route) => {
      quotaFetches.push(route.request().url());
      await route.continue();
    });
    expect((await page.goto('/quota'))?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Song not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(page.getByText('Untitled Smol')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(quotaFetches).toHaveLength(0);
  });
});

test.describe('FE-POST-1 song page: take durations, share fallback', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('AE-4 takes show recorded durations only', async ({ page }) => {
    await page.goto('/smol-2take');
    const takes = page.locator('section[aria-label="Takes"]');
    await expect(takes).toContainText('Take 1 · 3:19');
    await expect(takes).toContainText(/Take 2(?! ·)/);
  });

  test('AE-4 hero shows a single take length only when known', async ({ page }) => {
    const heroDuration = page.locator('article header [data-song-duration]');
    await page.goto('/smol-1take'); // ElevenLabs, 1 take, duration 120
    await expect(heroDuration).toHaveText('Duration 2:00');
    await expect(heroDuration).toBeVisible();
    await page.goto('/smol-2take'); // Classic, 2 takes: TakeSwitcher owns durations
    await expect(page.locator('section[aria-label="Takes"]')).toContainText('Take 1 · 3:19');
    await expect(heroDuration).toHaveCount(0);
    await page.goto('/smol-private'); // 1 take, no duration
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(heroDuration).toHaveCount(0);
  });

  test('AE-7 copy failures: lyrics/prompt say select the text; song link keeps the address-bar hint', async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    });
    await page.goto('/smol-2take');
    const toasts = page.getByRole('status');
    const prompt = page.locator('section', { has: page.getByRole('heading', { name: 'Prompt' }) });
    await prompt.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(toasts.filter({ hasText: 'Could not copy prompt. Try again, or select the text and copy it.' })).toBeVisible();

    await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
    const drawer = page.locator('dialog[open]');
    await drawer.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(toasts.filter({ hasText: 'Could not copy lyrics. Try again, or select the text and copy it.' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'More options' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Copy song link' }).click();
    await expect(toasts.filter({ hasText: 'Could not copy song link. Try again, or copy it from the address bar.' })).toBeVisible();
  });

  test('AE-7 share falls back to copy (not on cancel); a private link says anyone with it can listen', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: () => Promise.reject(new DOMException('blocked', (window as unknown as { __shareError?: string }).__shareError ?? 'NotAllowedError')),
      });
    });
    await page.goto('/smol-private');
    const share = page.getByRole('button', { name: 'Share song' });
    await page.evaluate(() => ((window as unknown as { __shareError: string }).__shareError = 'AbortError'));
    await share.click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/copied/)).toHaveCount(0);

    await page.evaluate(() => ((window as unknown as { __shareError: string }).__shareError = 'NotAllowedError'));
    await share.click();
    await expect(page.getByText('Song link copied — anyone with this link can listen.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/smol-private$/);
  });
});
