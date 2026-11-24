import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RENDERS_DIR = resolve('/home/tyler/code/smol/orchestration/renders/next');
const fixtureMp3 = readFileSync(new URL('../fixtures/tone.mp3', import.meta.url));
const OWNER_CONTRACT = 'CFIXTUREUSER0000000000000000000000000000000000000000000001';

function fakeSmolJwt() {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: OWNER_CONTRACT, key: 'fixture-key-1' })).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function interceptAudio(page: Page) {
  await page.route('**/song/*.mp3', async (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
    const headers = { 'accept-ranges': 'bytes' };
    if (!range) {
      await route.fulfill({ headers, body: fixtureMp3, contentType: 'audio/mpeg' });
      return;
    }
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), fixtureMp3.length - 1) : fixtureMp3.length - 1;
    await route.fulfill({
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${fixtureMp3.length}` },
      body: fixtureMp3.subarray(start, end + 1),
      contentType: 'audio/mpeg',
    });
  });
}

async function waitForImages(page: Page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img')).filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
    });
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 1500);
            })
      )
    );
  });
}

async function capture(page: Page, filename: string) {
  await waitForImages(page);
  await page.screenshot({ path: `${RENDERS_DIR}/${filename}` });
}

async function assertLayoutInvariants(page: Page, routeLabel: string) {
  const metrics = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;

    const inputFonts: { selector: string; size: number }[] = [];
    for (const el of document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="range"]), textarea')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      inputFonts.push({ selector: el.tagName + (el.id ? `#${el.id}` : ''), size });
    }

    const smallControls: { label: string; w: number; h: number }[] = [];
    const checkedRoots = [
      document.querySelector('#audio-player'),
      document.querySelector('nav[aria-label="Mobile navigation"]'),
      document.querySelector('form'),
      document.querySelector('dialog[open]'),
      document.querySelector('aside[data-mixtape-panel]'),
    ].filter((n): n is Element => Boolean(n));

    for (const root of checkedRoots) {
      for (const el of root.querySelectorAll('button, a, label:has(input[type="radio"]), label:has(input[role="switch"])')) {
        if (el.closest('.toast-stack')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.height < 43.5 || rect.width < 43.5) {
          smallControls.push({
            label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }
    }

    let dialogInnerOverflow = 0;
    const openDialog = document.querySelector('dialog[open]') ?? document.querySelector('aside[data-mixtape-panel]');
    if (openDialog) {
      for (const el of openDialog.querySelectorAll('[role="region"], section, aside, ul, li')) {
        dialogInnerOverflow = Math.max(dialogInnerOverflow, el.scrollWidth - el.clientWidth);
      }
    }

    return { overflow, dialogInnerOverflow, inputFonts, smallControls };
  });

  expect(metrics.overflow, `Horizontal overflow on ${routeLabel}`).toBeLessThanOrEqual(0);
  expect(metrics.dialogInnerOverflow, `Dialog inner overflow on ${routeLabel}`).toBeLessThanOrEqual(1);
  for (const input of metrics.inputFonts) {
    expect(input.size, `Input font-size < 16px on ${routeLabel} (${input.selector})`).toBeGreaterThanOrEqual(16);
  }
  expect(metrics.smallControls, `Controls < 44px on ${routeLabel}`).toEqual([]);
}

const VIEWPORTS = [
  { tag: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { tag: 'small', width: 375, height: 667, isMobile: true, hasTouch: true },
  { tag: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
];

for (const vp of VIEWPORTS) {
  test(`G4 layout, touch targets, inputs, bottom clearance and renders (${vp.tag} ${vp.width}x${vp.height})`, async ({
    page,
    context,
  }) => {
    mkdirSync(RENDERS_DIR, { recursive: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await interceptAudio(page);

    const dialogs: string[] = [];
    const pageErrors: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(`${d.type()}: ${d.message()}`);
      void d.dismiss();
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Home (anonymous)
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /`);
    if (vp.tag !== 'small') {
      await capture(page, `home-${vp.tag}.png`);
    } else {
      await capture(page, 'small-375-home.png');
    }

    // Start playback so PlayerDock is active across routes
    await page.getByRole('button', { name: 'Play First Track' }).click();
    const dock = page.getByRole('region', { name: 'Audio player' });
    await expect(dock).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: / playing`);

    // Verify last grid card is reachable above dock + tab bar after scrolling to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastCardClearance = await page.evaluate(() => {
      const cards = document.querySelectorAll('#main article');
      const last = cards[cards.length - 1];
      const dockEl = document.querySelector('#audio-player');
      if (!last || !dockEl) return 0;
      return dockEl.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
    });
    expect(lastCardClearance, `Last card covered by player dock on ${vp.tag}`).toBeGreaterThanOrEqual(-1);

    await page.evaluate(() => window.scrollTo(0, 0));
    if (vp.tag !== 'small') {
      await capture(page, `home-playing-${vp.tag}.png`);
    }

    // Capture NowPlayingSheet + top-layer toast on mobile (and assert 44px targets inside open sheet!)
    if (vp.tag === 'mobile') {
      await dock.getByRole('button', { name: 'Open now playing for First Track' }).click();
      const nowSheet = page.locator('dialog[open]');
      await expect(nowSheet.getByRole('heading', { name: 'Now playing' })).toBeVisible();
      await assertLayoutInvariants(page, `${vp.tag}: NowPlayingSheet`);
      await capture(page, 'now-playing-sheet-mobile.png');

      // Expand lyrics, click Copy -> toast must render ABOVE open NowPlayingSheet
      await nowSheet.getByRole('button', { name: 'Lyrics', exact: true }).click();
      await nowSheet.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Lyrics copied.' })).toBeVisible();
      await capture(page, 'now-playing-toast-mobile.png');

      await nowSheet.getByRole('button', { name: 'Close' }).click();
    }

    // 2. Logged-out Create
    await page.goto('/create');
    await expect(page.getByRole('button', { name: 'Sign in to create' })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /create logged-out`);
    if (vp.tag === 'mobile') {
      await capture(page, 'create-logged-out-mobile.png');
    }

    // Sign in via fixture cookie to verify logged-in composer, owner 2-take, 1-take, fallback, mixtapes & search
    await context.addCookies([
      { name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' },
    ]);

    // 3. Logged-in Create
    await page.goto('/create');
    await expect(page.getByRole('button', { name: 'Create song' })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /create logged-in`);
    if (vp.tag === 'small') {
      await capture(page, 'small-375-create.png');
    } else {
      await capture(page, `create-logged-in-${vp.tag}.png`);
    }

    // 4. Song 2-take (Classic, owned)
    await page.goto('/smol-2take');
    await expect(page.getByRole('heading', { name: 'Neon Arcade Runner' })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /smol-2take`);
    if (vp.tag !== 'small') {
      await capture(page, `song-2take-${vp.tag}.png`);
    }

    // 5. Song 1-take (ElevenLabs) & Fallback
    await page.goto('/smol-1take');
    await expect(page.getByRole('heading', { name: 'Velvet Rain Echo' })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /smol-1take`);
    if (vp.tag === 'mobile') {
      await capture(page, 'song-1take-mobile.png');
    }

    await page.goto('/smol-fallback');
    await expect(page.getByText('Made with ElevenLabs — Classic was unavailable.')).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /smol-fallback`);
    if (vp.tag === 'mobile') {
      await capture(page, 'song-fallback-mobile.png');
    }

    // 6. Mixtapes index, MixtapeBuilder sheet (R1 + R4 clipping check), AccountSheet, and Mixtape detail
    await page.goto('/mixtapes');
    await expect(page.getByRole('heading', { name: 'Mixtapes', exact: true })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /mixtapes`);
    if (vp.tag !== 'small') {
      await capture(page, `mixtapes-${vp.tag}.png`);
    }

    // Exercise AccountSheet + MixtapeBuilder + MixtapePicker across mobile, small 375, and desktop
    if (vp.tag === 'mobile' || vp.tag === 'small') {
      await page.goto('/');
      await page.getByRole('button', { name: 'Open account menu' }).click();
      const acctSheet = page.locator('dialog[open]');
      await expect(acctSheet.getByRole('heading', { name: 'Your library' })).toBeVisible();
      await assertLayoutInvariants(page, `${vp.tag}: AccountSheet`);
      if (vp.tag === 'mobile') {
        await capture(page, 'account-sheet-mobile.png');
      }

      // Open builder -> open in-sheet Picker -> add 2 tracks -> return to Builder -> check clipping & 44px targets
      await acctSheet.getByRole('button', { name: /New mixtape|Open mixtape draft/ }).click();
      const builderSheet = page.locator('dialog[open]');
      await expect(builderSheet.getByRole('button', { name: 'Add songs' })).toBeVisible();
      await builderSheet.getByRole('button', { name: 'Add songs' }).click();
      await expect(builderSheet.getByRole('heading', { name: 'Add songs' })).toBeVisible();
      await builderSheet.getByRole('button', { name: 'Add First Track to mixtape' }).click();
      await builderSheet.getByRole('button', { name: 'Add Second Track to mixtape' }).click();
      await assertLayoutInvariants(page, `${vp.tag}: MixtapePicker`);
      if (vp.tag === 'mobile') {
        await capture(page, 'mixtape-picker-mobile.png');
      }

      await builderSheet.getByRole('button', { name: 'Done' }).click();
      await expect(builderSheet.getByText('2 songs selected')).toBeVisible();
      await assertLayoutInvariants(page, `${vp.tag}: MixtapeBuilderSheet`);
      await capture(page, vp.tag === 'mobile' ? 'mixtape-builder-mobile.png' : 'mixtape-builder-375.png');

      // Discard draft so subsequent checks start clean
      await builderSheet.getByRole('button', { name: 'Discard' }).click();
      await page.getByRole('button', { name: 'Discard draft' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    } else {
      await page.goto('/');
      await page.getByRole('button', { name: /New mixtape|Mixtape draft/ }).click();
      // Desktop builder = non-modal docked panel (25d P2-8).
      const builderSheet = page.locator('aside[data-mixtape-panel]');
      await builderSheet.getByRole('button', { name: 'Add songs' }).click();
      await builderSheet.getByRole('button', { name: 'Add First Track to mixtape' }).click();
      await builderSheet.getByRole('button', { name: 'Add Second Track to mixtape' }).click();
      await assertLayoutInvariants(page, `${vp.tag}: MixtapePicker`);
      await capture(page, 'mixtape-picker-desktop.png');
      await builderSheet.getByRole('button', { name: 'Done' }).click();
      await expect(builderSheet.getByText('2 songs selected')).toBeVisible();
      await assertLayoutInvariants(page, `${vp.tag}: MixtapeBuilderSheet`);
      await capture(page, 'mixtape-builder-desktop.png');
      await builderSheet.getByRole('button', { name: 'Discard' }).click();
      await page.getByRole('button', { name: 'Discard draft' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    }

    await page.goto('/mixtapes/fixture-mixtape');
    await expect(page.getByRole('heading', { name: 'Fixture Mixtape' })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /mixtapes/fixture-mixtape`);
    if (vp.tag !== 'small') {
      await capture(page, `mixtape-detail-${vp.tag}.png`);
    }

    // 7. Search
    await page.goto('/search?q=love');
    await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
    await assertLayoutInvariants(page, `${vp.tag}: /search?q=love`);
    if (vp.tag !== 'small') {
      await capture(page, `search-${vp.tag}.png`);
    }

    expect(dialogs, 'No native alert/confirm/prompt dialogs may fire').toEqual([]);
    expect(pageErrors, 'No uncaught page errors').toEqual([]);
  });
}
