import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:4329';
const OWNER_CONTRACT = 'CFIXTUREUSER0000000000000000000000000000000000000000000001';

function fakeSmolJwt(sub = OWNER_CONTRACT, key = 'fixture-key-1') {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, key })).toString('base64url');
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

      // 2-take Classic (vocal, owned) page: switcher visible, prominent Lyrics lifted above Collectible + Lyrics jump button
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
      expect(lyricsBox!.y).toBeLessThan(collectibleBox!.y);
      await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
      await expect(page.locator('#song-lyrics-heading')).toBeFocused();

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
      // never loads passkey-kit, Stellar SDK, or MixtapeBuilder chunks eagerly.
      await page.goto('/');
      await page.locator('a[href="/smol-minted"]').first().click();
      await expect(page).toHaveURL('/smol-minted');
      await expect(page.getByRole('heading', { name: 'Starlight Mint Anthem' })).toBeVisible();
      await expect(page.getByText('Minted', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Trade', exact: true })).toBeVisible();

      await page.goto('/mixtapes/fixture-mixtape');
      await page.goto('/search?q=love');
      for (const scriptUrl of requestedScripts) {
        expect(scriptUrl).not.toMatch(/passkey-kit|stellar-sdk|tldts|svelte-dnd-action|MixtapeBuilder\.svelte|MixtapeBuilderSheet|MintTradeModal/i);
      }
    });

    test('mixtape mode decouples sheet from browse-and-add and renders without clipping (R1 + R4)', async ({
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

      await page.goto('/');

      // Enter mixtape mode (desktop TopBar button vs mobile Mixtapes page / Account sheet)
      if (viewport.width >= 1024) {
        await page.getByRole('button', { name: 'New mixtape' }).click();
      } else {
        await page.getByRole('button', { name: 'Open account menu' }).click();
        await page.locator('dialog[open]').getByRole('button', { name: 'New mixtape' }).click();
      }

      const builderDialog = page.locator('dialog[open]');
      await expect(builderDialog.getByRole('heading', { name: 'New mixtape' })).toBeVisible();

      // Dismiss sheet -> mixtape mode stays active so feed cards expose + Add buttons
      await builderDialog.getByRole('button', { name: 'Close' }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);

      const firstAddBtn = page.getByRole('button', { name: 'Add', exact: true }).first();
      await expect(firstAddBtn).toBeVisible();
      await firstAddBtn.click();

      // Reopen builder sheet via mobile Draft tab badge or desktop Mixtape draft button
      if (viewport.width >= 1024) {
        await page.getByRole('button', { name: /Mixtape draft/ }).click();
      } else {
        await page.getByRole('button', { name: 'Open mixtape draft (1)' }).click();
      }

      await expect(builderDialog.getByRole('heading', { name: '1 song in draft' })).toBeVisible();
      await expect(builderDialog.getByText('1 song selected')).toBeVisible();

      // Verify zero horizontal clipping inside the open MixtapeBuilder sheet
      const innerOverflow = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        if (!dialog) return -1;
        let maxOverflow = 0;
        for (const el of dialog.querySelectorAll('[role="region"], section, aside, ul, li')) {
          maxOverflow = Math.max(maxOverflow, el.scrollWidth - el.clientWidth);
        }
        return maxOverflow;
      });
      expect(innerOverflow).toBeLessThanOrEqual(1);
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
