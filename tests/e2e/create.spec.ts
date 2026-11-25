import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:4329';
const OWNER_CONTRACT = 'CFIXTUREUSER0000000000000000000000000000000000000000000001';

function fakeSmolJwt(sub = OWNER_CONTRACT, key = 'fixture-key-1') {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub, key, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  test.describe(`G2 Create, provider toggle, 1-take vs 2-take, fallback & retry (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('logged-out create prompts sign-in via AuthSheet without native dialogs', async ({ page }) => {
      const quotaRequests: string[] = [];
      page.on('request', (req) => {
        if (req.url().endsWith('/quota')) quotaRequests.push(req.url());
      });
      await page.goto('/create');
      await expect(page.getByRole('heading', { name: 'Create a song' })).toBeVisible();
      await expect(page.getByText(/left today/)).toHaveCount(0);
      await page.getByRole('button', { name: 'Sign in to create' }).click();
      await expect(page.locator('dialog[open]').getByRole('heading', { name: /Sign in to SMOL/ })).toBeVisible();
      expect(quotaRequests).toHaveLength(0);
    });

    test('composer sends canonical provider, never truncates prompt, and respects 1-take / 2-take / fallback / retry', async ({
      page,
      context,
      request,
    }) => {
      await request.post(`${api}/__reset`);

      await context.addCookies([
        {
          name: 'smol_token',
          value: fakeSmolJwt(),
          url: 'http://127.0.0.1:4328',
        },
      ]);

      // Track client JS requests to ensure logged-in non-wallet navigation never fetches Stellar/passkey chunks.
      const requestedScripts: string[] = [];
      page.on('request', (req) => {
        if (req.resourceType() === 'script') requestedScripts.push(req.url());
      });

      await page.goto('/create');

      // Default provider is aisonggenerator (Classic) with subtle quota counts per model
      const classicRadio = page.locator('input[type="radio"][name="provider"][value="aisonggenerator"]');
      const elevenLabsRadio = page.locator('input[type="radio"][name="provider"][value="elevenlabs"]');
      await expect(classicRadio).toBeChecked();
      await expect(page.locator('label', { hasText: 'Classic' })).toContainText('7 left today');
      await expect(page.locator('label', { hasText: 'ElevenLabs' })).toContainText('2 left today');
      await expect(page.getByText(/Classic creates 2 takes/)).toBeVisible();

      // Enter 420-char prompt, toggle Instrumental (limit 380) -> text is NEVER truncated!
      const longPrompt = 'synthwave '.repeat(42).trim();
      const textarea = page.locator('#song-prompt');
      await textarea.fill(longPrompt);
      expect((await textarea.inputValue()).length).toBe(longPrompt.length);

      await page.getByRole('switch', { name: /Instrumental/ }).click({ force: true });
      expect(await textarea.inputValue()).toBe(longPrompt);
      const overBy = longPrompt.length - 380;
      await expect(page.getByRole('button', { name: `Shorten prompt (${overBy} over)` })).toBeDisabled();

      // Switch to ElevenLabs -> still never truncates, updates ETA copy
      await page.locator('label', { hasText: 'ElevenLabs' }).click();
      await expect(elevenLabsRadio).toBeChecked();
      expect(await textarea.inputValue()).toBe(longPrompt);
      await expect(page.getByText(/ElevenLabs creates 1 take/)).toBeVisible();

      // Turn Instrumental off, submit -> POST / receives provider: "elevenlabs"
      await page.getByRole('switch', { name: /Instrumental/ }).click({ force: true });
      await page.getByRole('button', { name: 'Create song' }).click();
      await expect(page).toHaveURL('/smol-generating');

      const mutationsAfterCreate = await (await request.get(`${api}/__mutations`)).json();
      expect(mutationsAfterCreate.lastCreateBody).toMatchObject({
        prompt: longPrompt,
        provider: 'elevenlabs',
        instrumental: false,
        public: true,
      });
      expect(mutationsAfterCreate.lastCreateBody.address).toBeUndefined();

      // 1-take ElevenLabs (instrumental) page: no take switcher, no "Use as main take", no Lyrics box/button
      await page.goto('/smol-1take');
      await expect(page.getByRole('heading', { name: 'Velvet Rain Echo' })).toBeVisible();
      await expect(page.locator('article header').getByText('ElevenLabs', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use as main take' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Play take 2' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Lyrics', exact: true })).toHaveCount(0);
      await expect(page.locator('#song-lyrics')).toHaveCount(0);
      await expect(page.locator('audio')).toHaveCount(1);

      // 2-take Classic (vocal, owned) page: switcher & Collectible above compact Lyrics preview + Spotify-style Lyrics drawer
      await page.goto('/smol-2take');
      await expect(page.getByRole('heading', { name: 'Neon Arcade Runner' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Lyrics', exact: true })).toBeVisible();
      const lyricsSection = page.locator('#song-lyrics');
      await expect(lyricsSection).toBeVisible();
      await expect(lyricsSection).toContainText('Coins drop slow in the midnight glow');
      const collectibleSection = page.locator('section[aria-label="Collectible"]');
      const lyricsBox = await lyricsSection.boundingBox();
      const collectibleBox = await collectibleSection.boundingBox();
      expect(lyricsBox).not.toBeNull();
      expect(collectibleBox).not.toBeNull();
      expect(lyricsBox!.y).toBeGreaterThan(collectibleBox!.y);
      await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
      const lyricsDrawer = page.locator('dialog[open]');
      await expect(lyricsDrawer.getByRole('heading', { name: 'Lyrics', exact: true })).toBeVisible();
      await expect(lyricsDrawer).toContainText('Pixel skies above the street');
      await lyricsDrawer.getByRole('button', { name: 'Close' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);

      await expect(page.getByRole('button', { name: 'Play take 1' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play take 2' })).toBeVisible();
      await page.getByRole('button', { name: 'Use as main take' }).click();
      await expect.poll(async () => (await (await request.get(`${api}/__mutations`)).json()).swapCalls).toEqual([
        '/smol-2take/take-2',
      ]);

      // Fallback page: 1-take layout + fallback provenance line
      await page.goto('/smol-fallback');
      await expect(page.getByRole('heading', { name: 'Midnight Harbor Signal' })).toBeVisible();
      await expect(page.getByText('Made with ElevenLabs — Classic was unavailable.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use as main take' })).toHaveCount(0);

      // Retryable failure: offers "Try again" AND "Try with ElevenLabs" (sends override_provider)
      await page.goto('/smol-failed');
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
      await page.getByRole('button', { name: 'Try with ElevenLabs' }).click();
      const mutationsAfterRetry = await (await request.get(`${api}/__mutations`)).json();
      expect(mutationsAfterRetry.lastRetryBody).toEqual({ override_provider: 'elevenlabs' });

      // Non-retryable policy failure: offers "Edit prompt" ONLY
      await page.goto('/smol-failed-policy');
      await expect(page.getByRole('button', { name: 'Edit prompt' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);

      // G3 runtime check: logged-in navigation across non-wallet routes (including in-app nav to an already-minted song)
      // never loads passkey-kit, the full Stellar SDK, or MixtapeBuilder chunks. The signed-in header KALE balance
      // lazily imports the batched ledger reader (minimal SDK only) after hydration; its static closure stays
      // SDK-free (enforced by scripts/check-bundle.mjs).
      await page.goto('/');
      await page.locator('a[href="/smol-minted"]').first().click();
      await expect(page).toHaveURL('/smol-minted');
      await expect(page.getByRole('heading', { name: 'Starlight Mint Anthem' })).toBeVisible();
      await expect(page.getByText('Minted', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Trade', exact: true })).toBeVisible();

      await page.goto('/mixtapes/fixture-mixtape');
      await page.goto('/search?q=love');
      for (const scriptUrl of requestedScripts) {
        expect(scriptUrl).not.toMatch(/passkey-kit|stellar-sdk(?!_minimal)|tldts|svelte-dnd-action|MixtapeBuilder\.svelte|MixtapeBuilderSheet|MintTradeModal/i);
      }
    });

    test('mixtape overhaul: single draft, in-sheet picker, B-01/B-02/B-03/B-04/B-05/B-09/B-11/B-15/B-16 safety & zero clipping', async ({
      page,
      context,
    }) => {
      // B-15 logged-out /mixtapes has SSR cards + Make a mixtape CTA
      await page.goto('/mixtapes');
      await expect(page.locator('main article a[href^="/mixtapes/"]').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Make a mixtape' })).toBeVisible();

      // B-16 unknown mixtape returns HTTP 404
      const notFoundRes = await page.goto('/mixtapes/smoke-does-not-exist');
      expect(notFoundRes?.status()).toBe(404);
      await expect(page.getByText('Mixtape not found')).toBeVisible();

      await context.addCookies([
        {
          name: 'smol_token',
          value: fakeSmolJwt(),
          url: 'http://127.0.0.1:4328',
        },
      ]);

      await page.goto('/');

      // Open new mixtape builder (empty state offers in-sheet Add songs + suggestions — B-07)
      if (viewport.width >= 1024) {
        await page.getByRole('button', { name: 'New mixtape' }).click();
      } else {
        await page.getByRole('button', { name: 'Open account menu' }).click();
        await page.locator('dialog[open]').getByRole('button', { name: 'New mixtape' }).click();
      }

      // Desktop (lg+) builder is a non-modal docked panel (25d P2-8); mobile keeps the bottom sheet.
      const builderDialog =
        viewport.width >= 1024 ? page.locator('aside[data-mixtape-panel]') : page.locator('dialog[open]');
      await expect(builderDialog.getByRole('heading', { name: 'New mixtape' })).toBeVisible();
      await expect(builderDialog.getByRole('button', { name: 'Add songs' })).toBeVisible();
      await expect(builderDialog.getByRole('button', { name: 'Add a song to publish' })).toBeDisabled();

      // Open in-sheet "Add songs" picker, toggle 1 track in place (⊕ -> ✓), return with Done
      await builderDialog.getByRole('button', { name: 'Add songs' }).click();
      await expect(builderDialog.getByRole('heading', { name: 'Add songs' })).toBeVisible();
      await expect(builderDialog.getByPlaceholder(/Search songs/i)).toBeVisible();
      await builderDialog.getByRole('button', { name: 'Add First Track to mixtape' }).click();
      await expect(builderDialog.getByRole('button', { name: 'Remove First Track from mixtape' })).toBeVisible();
      await builderDialog.getByRole('button', { name: 'Done' }).click();
      await expect(builderDialog.getByText('1 song selected')).toBeVisible();

      // Set title, close builder -> Mixtapes tab stays reachable (B-05) & feed shows accessible +Add chips (B-18)
      await builderDialog.getByLabel('Title').fill('Smoke Mix');
      await builderDialog.getByRole('button', { name: 'Close' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);

      if (viewport.width < 1024) {
        await expect(
          page.getByRole('navigation', { name: 'Mobile navigation' }).locator('a[href="/mixtapes"]')
        ).toBeVisible();
      }

      // Add 2 more songs rapidly from feed -> coalesced into <= 1 toast (B-04)
      await page.getByRole('button', { name: 'Add Second Track to mixtape' }).click();
      await page.getByRole('button', { name: 'Add Third Track to mixtape' }).click();
      const addToasts = page.locator('.toast-stack [role="status"]').filter({ hasText: /mixtape draft/i });
      expect(await addToasts.count()).toBeLessThanOrEqual(1);

      // Reopen builder via floating draft pill (mobile) or header Mixtape draft button (desktop)
      if (viewport.width >= 1024) {
        await page.getByRole('button', { name: /Mixtape draft/ }).click();
      } else {
        await page.getByRole('button', { name: 'Open mixtape draft (3)' }).click();
      }

      await expect(builderDialog.getByRole('heading', { name: 'Smoke Mix' })).toBeVisible();
      await expect(builderDialog.getByText('3 songs selected')).toBeVisible();
      await expect(builderDialog.getByRole('button', { name: /Publish mixtape \(3\)/ })).toBeVisible();

      // Verify zero horizontal clipping inside the open MixtapeBuilder sheet
      const innerOverflow = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]') ?? document.querySelector('aside[data-mixtape-panel]');
        if (!dialog) return -1;
        let maxOverflow = 0;
        for (const el of dialog.querySelectorAll('[role="region"], section, aside, ul, li')) {
          maxOverflow = Math.max(maxOverflow, el.scrollWidth - el.clientWidth);
        }
        return maxOverflow;
      });
      expect(innerOverflow).toBeLessThanOrEqual(1);

      // B-09: keyboard reorder keeps focus on a Move track button and updates order
      const firstMoveDown = builderDialog.locator('[data-mixtape-track-id] button[aria-label="Move track down"]').first();
      await firstMoveDown.focus();
      await page.keyboard.press('Enter');
      const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
      expect(focusedLabel).toMatch(/^Move track (up|down)$/);

      // Desktop handle-only mouse drag reorder + persistence
      if (viewport.width >= 1024) {
        const dragPos = await page.evaluate(() => {
          const handles = Array.from(document.querySelectorAll('[data-mixtape-track-id] [data-drag-handle]'));
          if (handles.length < 3) return null;
          const from = handles[2].getBoundingClientRect();
          const to = handles[0].getBoundingClientRect();
          return {
            x: Math.round(from.left + from.width / 2),
            y0: Math.round(from.top + from.height / 2),
            y1: Math.round(to.top + 4),
          };
        });
        expect(dragPos).not.toBeNull();
        const firstBefore = await page.evaluate(() =>
          document.querySelector('[data-mixtape-track-id]')?.getAttribute('data-mixtape-track-id')
        );
        await page.mouse.move(dragPos!.x, dragPos!.y0);
        await page.mouse.down();
        await page.mouse.move(dragPos!.x, dragPos!.y1, { steps: 6 });
        await page.mouse.up();
        const firstAfter = await page.evaluate(() => {
          const draft = JSON.parse(localStorage.getItem('smol:mixtape-draft') || '{}');
          return draft.tracks?.[0]?.id;
        });
        expect(firstAfter).not.toBe(firstBefore);
      }

      // B-03: touch swipe on row body must NOT trigger drag (only explicit handle drags)
      const draggedOnRowSwipe = await page.evaluate(() => {
        const row = document.querySelectorAll('[data-mixtape-track-id]')[1];
        if (!row) return false;
        const r = row.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const makeTouch = (yy: number) =>
          new Touch({ identifier: 11, target: row, clientX: x, clientY: yy, pageX: x, pageY: yy });
        row.dispatchEvent(
          new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [makeTouch(y)],
            targetTouches: [makeTouch(y)],
            changedTouches: [makeTouch(y)],
          })
        );
        for (let i = 1; i <= 5; i++) {
          document.dispatchEvent(
            new TouchEvent('touchmove', {
              bubbles: true,
              cancelable: true,
              touches: [makeTouch(y - i * 18)],
              targetTouches: [makeTouch(y - i * 18)],
              changedTouches: [makeTouch(y - i * 18)],
            })
          );
        }
        const dragging = Boolean(document.getElementById('dnd-action-dragged-el'));
        document.dispatchEvent(
          new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [makeTouch(y - 90)],
          })
        );
        return dragging;
      });
      expect(draggedOnRowSwipe).toBe(false);

      // B-11: remove track shows Undo toast, clicking Undo restores count to 3
      await builderDialog.getByRole('button', { name: 'Remove track' }).first().click();
      await expect(builderDialog.getByText('2 songs selected')).toBeVisible();
      const undoToast = page.locator('.toast-stack [role="status"]').filter({ hasText: /Removed/i });
      await expect(undoToast.getByRole('button', { name: 'Undo' })).toBeVisible();
      await undoToast.getByRole('button', { name: 'Undo' }).click();
      await expect(builderDialog.getByText('3 songs selected')).toBeVisible();

      // B-02: malformed 2xx publish ({ ok: true } without id) MUST keep draft intact & never go to /mixtapes/undefined
      await page.route(`${api}/mixtapes`, async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
              'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
              'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({ ok: true }),
          });
          return;
        }
        await route.continue();
      });
      await builderDialog.getByRole('button', { name: /Publish mixtape/ }).click();
      await expect(builderDialog.getByRole('alert')).toContainText(/draft is safe/i);
      expect(new URL(page.url()).pathname).not.toContain('undefined');
      await expect(builderDialog.getByText('3 songs selected')).toBeVisible();
      await page.unroute(`${api}/mixtapes`);

      // B-01: Now Playing "Add to mixtape" stores public visibility & updates button to "In mixtape" (B-10)
      await builderDialog.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: 'Play Neon Arcade Runner' }).click();
      const dock = page.getByRole('region', { name: 'Audio player' });
      if (viewport.width >= 1024) {
        await dock.getByRole('button', { name: 'Expand player' }).click();
      } else {
        await dock.getByRole('button', { name: 'Open now playing for Neon Arcade Runner' }).click();
      }
      const npDialog = page.locator('dialog[open]');
      await npDialog.getByRole('button', { name: 'Add to mixtape' }).click();
      await expect(npDialog.getByRole('button', { name: 'In mixtape' })).toBeVisible();
      const allTracksHavePublic = await page.evaluate(() => {
        const draft = JSON.parse(localStorage.getItem('smol:mixtape-draft') || '{}');
        return Array.isArray(draft.tracks) && draft.tracks.length === 4 && draft.tracks.every((t: { public?: number }) => t.public === 1);
      });
      expect(allTracksHavePublic).toBe(true);
      await npDialog.getByRole('button', { name: 'Close' }).click();

      // Happy-path publish clears draft and navigates to /mixtapes/fixture-mixtape
      if (viewport.width >= 1024) {
        await page.getByRole('button', { name: /Mixtape draft/ }).click();
      } else {
        await page.getByRole('button', { name: 'Open mixtape draft (4)' }).click();
      }
      await builderDialog.getByRole('button', { name: /Publish mixtape \(4\)/ }).click();
      await expect(page).toHaveURL('/mixtapes/fixture-mixtape');
      const cleared = await page.evaluate(() => !localStorage.getItem('smol:mixtape-draft'));
      expect(cleared).toBe(true);
    });

    test('toasts render in the top layer above open sheets and stay interactive (R2)', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/');
      await page.getByRole('button', { name: 'Play First Track' }).click();

      const dock = page.getByRole('region', { name: 'Audio player' });
      if (viewport.width >= 1024) {
        await dock.getByRole('button', { name: 'Expand player' }).click();
      } else {
        await dock.getByRole('button', { name: 'Open now playing for First Track' }).click();
      }

      const sheet = page.locator('dialog[open]');
      await expect(sheet.getByRole('heading', { name: 'Now playing' })).toBeVisible();

      await sheet.getByRole('button', { name: 'Lyrics', exact: true }).click();
      await sheet.getByRole('button', { name: 'Copy', exact: true }).click();

      const toastStatus = page.getByRole('status').filter({ hasText: 'Lyrics copied.' });
      await expect(toastStatus).toBeVisible();

      // Verify the toast is inside the open dialog top layer and receives pointer hits (not covered/inert)
      const hitCheck = await toastStatus.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          insideOpenDialog: Boolean(el.closest('dialog[open]')),
          hitIsToast: Boolean(hit && el.contains(hit)),
        };
      });
      expect(hitCheck).toEqual({ insideOpenDialog: true, hitIsToast: true });

      // Dismissing the toast works interactively without closing the sheet
      await toastStatus.getByRole('button', { name: 'Dismiss notification' }).click();
      await expect(toastStatus).toHaveCount(0);
      await expect(sheet.getByRole('heading', { name: 'Now playing' })).toBeVisible();
    });

    test('quota 0-remaining, graceful /quota fallback, and 429 quota_exceeded on submit & retry', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'smol_token',
          value: fakeSmolJwt(),
          url: 'http://127.0.0.1:4328',
        },
      ]);

      // 1. Graceful fallback when GET /quota is unavailable
      await page.route(`${api}/quota`, async (route) => {
        await route.fulfill({ status: 503, body: 'unavailable' });
      });
      await page.goto('/create');
      await expect(page.getByRole('heading', { name: 'Create a song' })).toBeVisible();
      await expect(page.getByText(/left today/)).toHaveCount(0);
      await page.locator('#song-prompt').fill('Warm analog synth beat');
      await expect(page.getByRole('button', { name: 'Create song' })).toBeEnabled();
      await page.unroute(`${api}/quota`);

      // 2. 0 remaining on ElevenLabs disables submit, shows reset time, and offers switching to Classic
      const resetAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      await page.route(`${api}/quota`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({
            classic: { limit: 10, used: 2, remaining: 8, resetAt },
            elevenlabs: { limit: 3, used: 3, remaining: 0, resetAt },
          }),
        });
      });

      await page.goto('/create');
      await expect(page.locator('label', { hasText: 'Classic' })).toContainText('8 left today');
      await expect(page.locator('label', { hasText: 'ElevenLabs' })).toContainText('0 left today');

      await page.locator('#song-prompt').fill('Midnight pixel ballad');
      await page.locator('label', { hasText: 'ElevenLabs' }).click();
      await expect(page.getByRole('alert')).toContainText(/used all 3 ElevenLabs songs for today.*Resets/i);
      await expect(page.getByRole('button', { name: 'Daily ElevenLabs limit reached' })).toBeDisabled();

      // Quick switch back to Classic re-enables Create song
      await page.getByRole('button', { name: 'Switch to Classic (8 left)' }).click();
      await expect(page.locator('input[type="radio"][name="provider"][value="aisonggenerator"]')).toBeChecked();
      await expect(page.getByRole('button', { name: 'Create song' })).toBeEnabled();

      // 3. 429 quota_exceeded on POST / submit preserves prompt, updates quota UI to 0 left, and shows inline + toast
      await page.route(`${api}/`, async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 429,
            contentType: 'application/json',
            headers: {
              'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
              'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
              error: 'Daily Classic quota exceeded',
              code: 'quota_exceeded',
              provider: 'classic',
              limit: 10,
              used: 10,
              remaining: 0,
              resetAt,
            }),
          });
          return;
        }
        await route.continue();
      });

      await page.getByRole('button', { name: 'Create song' }).click();
      await expect(page.locator('#song-prompt')).toHaveValue('Midnight pixel ballad');
      await expect(page.locator('label', { hasText: 'Classic' })).toContainText('0 left today');
      await expect(page.locator('form [role="alert"]')).toContainText(/used all 10 Classic songs for today.*Resets/i);
      await expect(page.getByRole('button', { name: 'Daily Classic limit reached' })).toBeDisabled();
      await expect(page.locator('.toast-stack [role="status"]').last()).toContainText(/Classic/i);

      // 4. 429 quota_exceeded on POST /retry/:id with override_provider shows inline feedback + toast
      await page.route(`${api}/retry/**`, async (route) => {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({
            error: 'Daily ElevenLabs quota exceeded',
            code: 'quota_exceeded',
            provider: 'elevenlabs',
            limit: 3,
            used: 3,
            remaining: 0,
            resetAt,
          }),
        });
      });

      await page.goto('/smol-failed');
      await page.getByRole('button', { name: 'Try with ElevenLabs' }).click();
      await expect(page.locator('main [role="alert"]').first()).toContainText(/used all 3 ElevenLabs songs for today.*Resets/i);
      await expect(page.locator('.toast-stack [role="status"]').last()).toContainText(/ElevenLabs/i);
    });
  });
}

test.describe('FE-POST-1 create flow: visibility carry-over, optimistic details, title, background status', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('remix / edit prompt keep visibility + requested model; first paint and tab title track the new song', async ({
    page,
    context,
    request,
  }) => {
    await request.post(`${api}/__reset`);
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(), url: 'http://127.0.0.1:4328' }]);
    const publicSwitch = page.locator('#create-public');
    const radio = (provider: string) => page.locator(`input[type="radio"][name="provider"][value="${provider}"]`);
    const remixFrom = async (path: string, action = 'Remix prompt') => {
      await page.goto(path);
      await page.getByRole('button', { name: action }).first().click();
      await expect(page).toHaveURL('/create');
    };

    // (e) A blank /create defaults to Public; AE-5 reset caption; AE-6 instrumental limit up front.
    await page.goto('/create');
    await expect(publicSwitch).toBeChecked();
    await expect(page.getByText(/^Daily limits reset .+\.$/)).toBeVisible();
    await expect(page.getByText('No vocals or lyrics · 380-character prompt limit')).toBeVisible();
    await page.locator('label', { hasText: 'ElevenLabs' }).click(); // stored model: ElevenLabs

    // (a) private song → Private; (b) published, then hidden → Private (D1 wins over payload.public).
    await remixFrom('/smol-private');
    await expect(publicSwitch).not.toBeChecked();
    await remixFrom('/smol-hidden');
    await expect(publicSwitch).not.toBeChecked();
    await remixFrom('/smol-published-was-private');
    await expect(publicSwitch).toBeChecked();
    // (d) Classic fell back to ElevenLabs: the remix asks for Classic again, not the stored model.
    await remixFrom('/smol-fallback');
    await expect(radio('aisonggenerator')).toBeChecked();
    // (c) Edit prompt on a failed private ElevenLabs song.
    await remixFrom('/smol-failed-config', 'Edit prompt');
    await expect(publicSwitch).not.toBeChecked();
    await expect(radio('elevenlabs')).toBeChecked();
    await page.reload(); // the draft is one-shot: a fresh /create is Public again
    await expect(publicSwitch).toBeChecked();

    // AE-2 / F3: before the first GET lands, Details says Private and the tab says "Creating".
    let firstGet!: () => void;
    const held = new Promise<void>((resolve) => (firstGet = resolve));
    let status: Record<string, unknown> = { wf: { status: 'running' } };
    await page.route(`${api}/smol-generating`, async (route) => {
      await held;
      const response = await route.fetch();
      const body = await response.json();
      body.kv_do.payload.public = false;
      await route.fulfill({ response, json: { ...body, ...status } });
    });
    await publicSwitch.click({ force: true });
    await page.locator('#song-prompt').fill('Lo-fi rain on a tin roof');
    await page.getByRole('button', { name: 'Create song' }).click();
    await expect(page).toHaveURL('/smol-generating');
    await expect(page.locator('aside[aria-labelledby="song-details-heading"]')).toContainText('Private');
    await expect(page).toHaveTitle('Creating your song… · SMOL');
    firstGet();
    await expect(page).toHaveTitle('Orbital Lounge · SMOL');
    expect((await (await request.get(`${api}/__mutations`)).json()).lastCreateBody).toMatchObject({ public: false });

    // AE-9: a background song finishing lights the desktop Created dot until /created is visited.
    const softNavigate = (href: string) =>
      page.evaluate((target) => {
        const a = Object.assign(document.createElement('a'), { href: target });
        document.body.appendChild(a);
        a.click();
      }, href);
    await softNavigate('/');
    await expect(page).toHaveURL('/');
    status = { kv_do: { songs: [{ music_id: 'take-1', status: 4 }], lyrics: { title: 'Orbital Lounge' } }, wf: { status: 'complete' } };
    const readyDot = page.locator('header a[href="/created"] [data-ready-dot]');
    await expect(page.getByText('"Orbital Lounge" is ready.')).toBeVisible({ timeout: 15_000 });
    await expect(readyDot).toBeVisible();
    await softNavigate('/created');
    await expect(page).toHaveURL('/created');
    await expect(readyDot).toHaveCount(0);

    // AE-9: a background failure says so instead of stopping silently.
    status = { wf: { status: 'running' } };
    await page.goto('/create');
    await page.locator('#song-prompt').fill('Lo-fi rain on a tin roof');
    await page.getByRole('button', { name: 'Create song' }).click();
    await expect(page).toHaveTitle('Orbital Lounge · SMOL');
    await softNavigate('/');
    await expect(page).toHaveURL('/');
    status = { wf: { status: 'errored' } };
    await expect(page.getByText(/"Orbital Lounge" couldn't be created/)).toBeVisible({ timeout: 15_000 });
  });
});
