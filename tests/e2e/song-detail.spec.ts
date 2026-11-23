import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
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
  await page.screenshot({ path: path.join(renderDir, name), fullPage });
}

// Compare against the configured viewport width (window.innerWidth grows under isMobile emulation when content overflows).
async function assertNoOverflow(page: Page, expectedWidth: number, label: string) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(expectedWidth + 1);
}

const VIEWPORTS = [
  { tag: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { tag: 'tablet', width: 768, height: 1024, isMobile: false, hasTouch: false },
  { tag: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { tag: 'small', width: 375, height: 812, isMobile: true, hasTouch: true },
];

for (const vp of VIEWPORTS) {
  test.describe(`Song detail lifecycle (${vp.tag} ${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });

    test('completed vocal 2-take (owner): Details under cover art on desktop, compact Lyrics + Drawer, prominent More like this', async ({
      page,
      context,
    }) => {
      await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);
      await page.goto('/smol-2take');

      await expect(page.getByRole('heading', { name: 'Neon Arcade Runner' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'More like this' })).toBeVisible();
      await assertNoOverflow(page, vp.width, `${vp.tag}: /smol-2take`);

      const details = page.locator('aside[aria-labelledby="song-details-heading"]');
      if (vp.width >= 1024) {
        await expect(details).toContainText('Plays');
        await expect(details).toContainText('55');
        await expect(details).toContainText('Public');
        await expect(details).toContainText('Classic');
      } else {
        // Mobile / tablet starts with compact 1-row Details disclosure so "More like this" sits high
        const toggleBtn = details.getByRole('button', { name: /Details/ });
        await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
        await expect(toggleBtn).toContainText('55 plays');
      }

      // Geometry verification on desktop: Details directly under Cover Art in left rail; Lyrics below Collectible
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

      await capture(page, `song-2take-owner-${vp.tag}.png`);

      // Mobile disclosure expands cleanly on tap
      if (vp.width < 1024) {
        const toggleBtn = details.getByRole('button', { name: /Details/ });
        await toggleBtn.click();
        await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
        await expect(details).toContainText('smol-2take');
      }

      // Open Spotify-style Lyrics drawer from preview card, verify stanza markers + Copy toast + footer Play bar
      await page.getByRole('button', { name: 'Read lyrics' }).click();
      const drawer = page.locator('dialog[open]');
      await expect(drawer.getByRole('heading', { name: 'Lyrics', exact: true })).toBeVisible();
      await expect(drawer).toContainText('Verse 1');
      await expect(drawer).toContainText('Chorus');
      await expect(drawer).toContainText('Pixel skies above the street');
      await expect(drawer.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

      if (vp.tag === 'desktop' || vp.tag === 'mobile') {
        await capture(page, `song-lyrics-drawer-${vp.tag}.png`, false);
      }

      // P1-2 regression (desktop): dragging lyrics text onto the backdrop must NOT close the drawer; plain backdrop click MUST close it.
      if (vp.tag === 'desktop') {
        const firstLine = drawer.getByText('Coins drop slow in the midnight glow');
        const lineBox = await firstLine.boundingBox();
        expect(lineBox).toBeTruthy();
        await page.mouse.move(lineBox!.x + 40, lineBox!.y + 8);
        await page.mouse.down();
        await page.mouse.move(100, lineBox!.y + 8, { steps: 5 });
        await page.mouse.up();
        await expect(page.locator('dialog[open]')).toHaveCount(1);

        // Plain backdrop click closes the drawer
        await page.mouse.click(100, 200);
        await expect(page.locator('dialog[open]')).toHaveCount(0);

        // Re-open to verify Copy top-layer toast
        await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
        await expect(drawer.getByRole('heading', { name: 'Lyrics', exact: true })).toBeVisible();
      }

      await drawer.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Lyrics copied.' })).toBeVisible();
      await drawer.getByRole('button', { name: 'Close' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    });

    test('non-owner signed-in visitor and signed-out visitor both hide owner controls cleanly', async ({
      page,
      context,
    }) => {
      // 1. Signed-out visitor
      await page.goto('/smol-2take');
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Lyrics', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mint', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add to mixtape' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Use as main take' })).toHaveCount(0);

      // 2. Signed-in as a DIFFERENT user (non-owner)
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
      await expect(page.getByRole('button', { name: 'Add to mixtape' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use as main take' })).toHaveCount(0);

      await page.getByRole('button', { name: 'More options' }).click();
      const moreSheet = page.locator('dialog[open]');
      await expect(moreSheet.getByRole('button', { name: 'Share song' })).toBeVisible();
      await expect(moreSheet.getByRole('button', { name: 'Copy song link' })).toBeVisible();
      await expect(moreSheet.getByRole('button', { name: 'Remix prompt' })).toBeVisible();
      await expect(moreSheet.getByRole('button', { name: 'Delete song' })).toHaveCount(0);
      await expect(moreSheet.getByRole('button', { name: 'Make private' })).toHaveCount(0);
      await moreSheet.getByRole('button', { name: 'Close' }).click();
    });

    test('private song, flagged & unknown safety, active generation stages, sanitized failures, and not-found', async ({
      page,
      context,
      request,
    }) => {
      await request.get(`${api}/__reset`);
      await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);

      // 1. Private published song: accurate owner banner copy + direct Publish to feed CTA
      await page.goto('/smol-private');
      await expect(
        page.getByText('Private · Hidden from feeds and search. Anyone with the link can listen.')
      ).toBeVisible();
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

      // 2. Flagged / NSFW song: cover art stays visible, danger banner, NO Mint/Publish/Mixtape/More like this
      await page.goto('/smol-flagged');
      await expect(page.locator('article img.pixelated').first()).toBeVisible();
      await expect(page.getByText(/Flagged for sensitive content \(explicit\)/)).toBeVisible();
      await expect(page.locator('section[aria-label="Collectible"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Publish to feed' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add to mixtape' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'More like this' })).toHaveCount(0);
      await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Flagged');
      await assertNoOverflow(page, vp.width, `${vp.tag}: /smol-flagged`);
      if (vp.tag === 'desktop' || vp.tag === 'mobile') {
        await capture(page, `song-flagged-${vp.tag}.png`);
      }

      // 3. Early generating (private, no art/lyrics yet): accurate Visibility: Private (F3), 3-stage stepper, prompt visible
      await page.goto('/smol-generating-early');
      await expect(page.getByRole('heading', { name: 'Creating your song…' })).toBeVisible();
      await expect(page.locator('section[aria-label="Generation progress"]')).toBeVisible();
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
      await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
      const genDrawer = page.locator('dialog[open]');
      await expect(genDrawer).toContainText('Audio is still recording');
      await expect(genDrawer).toContainText('Floating past the silver ice');
      await genDrawer.getByRole('button', { name: 'Close' }).click();
      if (vp.tag === 'desktop' || vp.tag === 'mobile') {
        await capture(page, `song-generating-partial-${vp.tag}.png`);
      }

      // 5. Failed generation with internal config leak (F3 + F5): integrated in main column, no dead Play button, no CF_AI_GATEWAY_ID leak
      await page.goto('/smol-failed-config');
      const alertBox = page.locator('section[aria-label="Generation failed"]');
      await expect(alertBox).toBeVisible();
      await expect(alertBox).not.toContainText('CF_AI_GATEWAY_ID');
      await expect(alertBox).not.toContainText('CF_AIG_TOKEN');
      await expect(alertBox).toContainText(/temporarily unavailable/i);
      await expect(alertBox.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expect(alertBox.getByRole('button', { name: 'Try with Classic' })).toBeVisible();
      await expect(alertBox.getByRole('button', { name: 'Edit prompt' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
      await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Private');
      await assertNoOverflow(page, vp.width, `${vp.tag}: /smol-failed-config`);
      if (vp.tag === 'desktop' || vp.tag === 'mobile') {
        await capture(page, `song-failed-${vp.tag}.png`);
      }

      // 6. Not-found (404) state renders cleanly with recovery action
      await page.goto('/does-not-exist-404');
      await expect(page.getByRole('heading', { name: 'Could not load song' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
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
  });
}

test.describe('Fable P1 & P2 edge-case regressions', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

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
        // First client poll: still running with 1 of 2 takes
        await route.continue();
        return;
      }
      // Second client poll: published in D1 with 1 take and NO wf field
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

    // Poll 1 keeps it in generating; poll 2 publishes with 1 take -> stops polling, hides Generating, reveals Collectible + Private banner
    await expect(page.locator('section[aria-label="Collectible"]')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('Generating', { exact: true })).toHaveCount(0);
    await expect(page.getByText('1 of 2 takes finished.')).toBeVisible();

    const pollsAfterPublish = polls;
    await page.waitForTimeout(4500);
    expect(polls).toBe(pollsAfterPublish);
  });

  test('P2-3, P2-5, P2-10: nsfw unknown shows pending (not Flagged), duplicate tags never crash, 100-char unbroken tokens wrap cleanly', async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);
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
    // P2-3: pending notice, never "Flagged"
    await expect(page.getByText(/Safety check pending/)).toBeVisible();
    await expect(page.getByText(/Flagged for sensitive content/)).toHaveCount(0);
    // P2-10: duplicate tags deduplicated without throwing
    await expect(page.locator('[aria-label="Style tags"]')).toContainText('Pop');
    await expect(page.locator('[aria-label="Style tags"]')).toContainText('Rock');
    // P2-5: zero horizontal overflow against configured 390px viewport
    await assertNoOverflow(page, 390, 'mobile 390: long unbroken token');

    // Open Lyrics drawer and verify body wraps cleanly without horizontal clip
    await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
    const drawerOverflow = await page.evaluate(() => {
      const body = document.querySelector('[data-lyrics-body]');
      return body ? body.scrollWidth - body.clientWidth : -1;
    });
    expect(drawerOverflow).toBeLessThanOrEqual(1);
  });
});
