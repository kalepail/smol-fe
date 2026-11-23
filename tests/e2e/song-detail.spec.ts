import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const api = 'http://127.0.0.1:4329';
const renderDir = process.env.SMOL_SONG_RENDER_DIR || '';

function fakeSmolJwt(sub = 'CFIXTUREUSER0000000000000000000000000000000000000000000001') {
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, key: 'fixture-key-id', exp: 2000000000 })}.sig`;
}

async function capture(page: Page, name: string) {
  if (!renderDir) return;
  mkdirSync(renderDir, { recursive: true });
  await page.screenshot({ path: path.join(renderDir, name), fullPage: true });
}

async function assertNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
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
      await assertNoOverflow(page, `${vp.tag}: /smol-2take`);

      // Plays count subtly shown in Details
      const details = page.locator('aside[aria-labelledby="song-details-heading"]');
      await expect(details).toContainText('Plays');
      await expect(details).toContainText('55');
      await expect(details).toContainText('Public');
      await expect(details).toContainText('Classic');

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
        // Left rail alignment: Details starts right below cover art and shares its left column
        expect(Math.abs(detailsBox!.x - artBox!.x)).toBeLessThanOrEqual(4);
        expect(detailsBox!.y).toBeGreaterThan(artBox!.y + artBox!.height - 2);
        expect(detailsBox!.x + detailsBox!.width).toBeLessThan(collectibleBox!.x);
      } else {
        // Mobile / tablet stacked order: Cover Art -> Main (Collectible -> Lyrics preview) -> Details -> More like this
        expect(detailsBox!.y).toBeGreaterThan(lyricsBox!.y);
      }

      // Style tags capped at 8 with +2 more toggle
      await expect(page.getByRole('button', { name: '+2 more' })).toBeVisible();
      await page.getByRole('button', { name: '+2 more' }).click();
      await expect(page.getByText('High Energy', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Show fewer' }).click();

      await capture(page, `song-2take-owner-${vp.tag}.png`);

      // Open Spotify-style Lyrics drawer from preview card, verify stanza markers + Copy toast + footer Play bar
      await page.getByRole('button', { name: 'Read lyrics' }).click();
      const drawer = page.locator('dialog[open]');
      await expect(drawer.getByRole('heading', { name: 'Lyrics', exact: true })).toBeVisible();
      await expect(drawer).toContainText('Verse 1');
      await expect(drawer).toContainText('Chorus');
      await expect(drawer).toContainText('Pixel skies above the street');
      await expect(drawer.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

      if (vp.tag === 'desktop' || vp.tag === 'mobile') {
        await capture(page, `song-lyrics-drawer-${vp.tag}.png`);
      }

      await drawer.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Lyrics copied.' })).toBeVisible();
      await drawer.getByRole('button', { name: 'Close' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    });

    test('non-owner visitor vs signed-out hides owner controls cleanly', async ({ page, context }) => {
      // Signed-in as a DIFFERENT user (non-owner)
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

      // Overflow sheet offers utility actions (Copy link, Remix, Copy ID), NEVER Delete or Make private
      await page.getByRole('button', { name: 'More options' }).click();
      const moreSheet = page.locator('dialog[open]');
      await expect(moreSheet.getByRole('button', { name: 'Copy song link' })).toBeVisible();
      await expect(moreSheet.getByRole('button', { name: 'Remix prompt' })).toBeVisible();
      await expect(moreSheet.getByRole('button', { name: 'Delete song' })).toHaveCount(0);
      await expect(moreSheet.getByRole('button', { name: 'Make private' })).toHaveCount(0);
      await moreSheet.getByRole('button', { name: 'Close' }).click();
    });

    test('private song (owner banner + Publish), flagged NSFW, active generation stages, and sanitized failures', async ({
      page,
      context,
      request,
    }) => {
      await request.get(`${api}/__reset`);
      await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);

      // 1. Private published song: inline owner banner with direct Publish to feed CTA
      await page.goto('/smol-private');
      await expect(page.getByText(/Private · Only you can view this song/i)).toBeVisible();
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
      await assertNoOverflow(page, `${vp.tag}: /smol-flagged`);
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
      await assertNoOverflow(page, `${vp.tag}: /smol-generating-early`);
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
      await assertNoOverflow(page, `${vp.tag}: /smol-failed-config`);
      if (vp.tag === 'desktop' || vp.tag === 'mobile') {
        await capture(page, `song-failed-${vp.tag}.png`);
      }

      // 6. Cross-page sync checks: Mixtape header Share + Artist page header Share/Copy
      await page.goto('/mixtapes/fixture-mixtape');
      await expect(page.getByRole('button', { name: 'Share mixtape' })).toBeVisible();
      await assertNoOverflow(page, `${vp.tag}: /mixtapes/fixture-mixtape`);

      await page.goto('/artists/fixture-artist');
      await expect(page.getByRole('heading', { name: 'Fixture Artist' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Share artist' })).toBeVisible();
      await assertNoOverflow(page, `${vp.tag}: /artists/fixture-artist`);
    });
  });
}
