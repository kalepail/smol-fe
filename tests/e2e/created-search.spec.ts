import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';

// AE-8: owner-scoped `/created?q=` title filter. The fixture API (tests/fixtures/api.mjs)
// filters GET /created by a case-insensitive LITERAL title substring over the cookie
// owner's songs (private + public) and paginates by `cursor`.
const API_URL = 'http://127.0.0.1:4329';
const FRONTEND_URL = 'http://127.0.0.1:4328';
const OWNER = 'CFIXTUREUSER0000000000000000000000000000000000000000000001';
const PAGED_OWNER = 'CPAGEDOWNER00000000000000000000000000000000000000000000001';
const OTHER_OWNER = 'COTHERCREATOR000000000000000000000000000000000000000000001';

function fakeJwt(sub: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub, key: 'fixture-key-1', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function signIn(context: BrowserContext, wallet = OWNER) {
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(wallet), url: FRONTEND_URL }]);
}

/** Another tab changed the session; this tab reconciles when it regains focus. */
async function switchSession(page: Page, context: BrowserContext, wallet: string | null) {
  if (wallet) await signIn(context, wallet);
  else await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

/** Every browser GET /created list request, as parsed URLs (plus the cookie owner it carried). */
function recordCreatedRequests(page: Page) {
  const seen: { url: URL; owner: () => Promise<string | null> }[] = [];
  page.on('request', (req: Request) => {
    const url = new URL(req.url());
    if (url.origin !== API_URL || url.pathname !== '/created' || req.method() !== 'GET') return;
    const owner = async () => {
      const token = /(?:^|;\s*)smol_token=([^;]+)/.exec((await req.allHeaders())['cookie'] ?? '')?.[1];
      return token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub : null;
    };
    seen.push({ url, owner });
  });
  return seen;
}

const filter = (page: Page) => page.getByRole('searchbox', { name: 'Filter your songs by title' });
const play = (page: Page, title: string) => page.getByRole('button', { name: `Play ${title}`, exact: true });

test.describe('AE-8 /created title filter', () => {
  test('matches public and private songs case-insensitively; URL follows via replaceState', async ({
    page,
    context,
  }) => {
    await signIn(context);
    const requests = recordCreatedRequests(page);
    await page.goto('/created');
    await expect(play(page, 'First Track')).toBeVisible();
    await expect(play(page, 'Neon Private Sketch')).toBeVisible();
    const historyLength = await page.evaluate(() => history.length);

    // Typing is debounced: one request for the final value, none per keystroke.
    await filter(page).pressSequentially('nEoN', { delay: 40 });
    await expect(play(page, 'Neon Arcade Runner')).toBeVisible();
    await expect(play(page, 'Neon Private Sketch')).toBeVisible();
    await expect(play(page, 'First Track')).toHaveCount(0);
    await expect(page).toHaveURL('/created?q=nEoN');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);

    const queries = requests.map((r) => r.url.searchParams.get('q'));
    expect(queries).toEqual([null, 'nEoN']);
    expect(requests[1].url.searchParams.get('limit')).toBe('100');
    expect(requests[1].url.searchParams.has('cursor')).toBe(false);

    // Surrounding whitespace is trimmed; an unchanged trimmed query does not refetch.
    await filter(page).fill('  nEoN  ');
    await filter(page).press('Enter');
    await page.waitForTimeout(400);
    expect(requests).toHaveLength(2);
  });

  test('% and _ are sent and matched literally', async ({ page, context }) => {
    await signIn(context);
    const requests = recordCreatedRequests(page);
    await page.goto('/created');
    await expect(play(page, 'First Track')).toBeVisible();

    await filter(page).fill('100%');
    await expect(play(page, '100% Pure_Signal')).toBeVisible();
    await expect(page.locator('#main').getByRole('button', { name: /^Play / })).toHaveCount(1);
    await expect(page).toHaveURL('/created?q=100%25');
    expect(requests.at(-1)?.url.searchParams.get('q')).toBe('100%');

    // As a SQL LIKE wildcard `_` would match every title; literally it matches one.
    await filter(page).fill('_');
    await expect(page).toHaveURL('/created?q=_');
    await expect(play(page, '100% Pure_Signal')).toBeVisible();
    await expect(page.locator('#main').getByRole('button', { name: /^Play / })).toHaveCount(1);
    expect(requests.at(-1)?.url.searchParams.get('q')).toBe('_');
  });

  test('no matches shows "No matching songs"; Clear search restores the full list', async ({ page, context }) => {
    await signIn(context);
    await page.goto('/created');
    await expect(play(page, 'First Track')).toBeVisible();

    await filter(page).fill('zzz-nothing');
    await expect(page.getByRole('heading', { name: 'No matching songs' })).toBeVisible();
    await expect(page.getByText('No created songs match “zzz-nothing”.')).toBeVisible();
    await expect(page.getByText('No created songs yet')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(play(page, 'First Track')).toBeVisible();
    await expect(play(page, 'Neon Private Sketch')).toBeVisible();
    await expect(page).toHaveURL('/created');
    await expect(filter(page)).toHaveValue('');
    await expect(filter(page)).toBeFocused();
  });

  test('?q= initializes the filter; Enter and the clear button apply immediately', async ({ page, context }) => {
    await signIn(context);
    const requests = recordCreatedRequests(page);
    await page.goto(`/created?q=${encodeURIComponent('VELVET')}`);
    await expect(filter(page)).toHaveValue('VELVET');
    await expect(play(page, 'Velvet Rain Echo')).toBeVisible();
    await expect(play(page, 'First Track')).toHaveCount(0);
    // The first list request is already filtered (no unfiltered flash).
    expect(requests.map((r) => r.url.searchParams.get('q'))).toEqual(['VELVET']);

    // Pause timers: the debounce cannot fire, so only Enter can apply the query.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1_000);
    await filter(page).fill('second');
    await page.waitForTimeout(400);
    expect(requests).toHaveLength(1);
    await filter(page).press('Enter');
    await expect(play(page, 'Second Track')).toBeVisible();
    await expect(page).toHaveURL('/created?q=second');

    const clear = page.getByRole('button', { name: 'Clear title filter' });
    await clear.click();
    await expect(clear).toHaveCount(0);
    await expect(play(page, 'First Track')).toBeVisible();
    await expect(page).toHaveURL('/created');
    expect(requests.map((r) => r.url.searchParams.get('q'))).toEqual(['VELVET', 'second', null]);

    // Long deep links are clamped to the API's 100-character limit.
    await page.goto(`/created?q=${'x'.repeat(140)}`);
    await expect(filter(page)).toHaveValue('x'.repeat(100));
    await expect(filter(page)).toHaveAttribute('maxlength', '100');
    expect(requests.at(-1)?.url.searchParams.get('q')).toBe('x'.repeat(100));
  });

  test('load-more pages carry the active q; a new q restarts from page 1', async ({ page, context }) => {
    await signIn(context, PAGED_OWNER);
    const requests = recordCreatedRequests(page);
    await page.goto('/created');
    await expect(play(page, 'Loop 1')).toBeVisible();

    const before = requests.length;
    await filter(page).fill('loop');
    await expect(play(page, 'Loop 1')).toBeVisible();
    await expect(play(page, 'Drift 6')).toHaveCount(0);
    // Scroll to the end until infinite scroll has loaded every filtered page.
    const cards = page.locator('#main').getByRole('button', { name: /^Play / });
    await expect(async () => {
      await cards.last().scrollIntoViewIfNeeded();
      await expect(play(page, 'Loop 35')).toBeAttached({ timeout: 500 });
    }).toPass();
    await expect(cards).toHaveCount(30);
    await expect(page.getByRole('button', { name: /^Play Drift / })).toHaveCount(0);
    const loopPages = requests.slice(before);
    expect(loopPages.map((r) => r.url.searchParams.get('q'))).toEqual(['loop', 'loop', 'loop']);
    expect(loopPages.map((r) => r.url.searchParams.get('cursor'))).toEqual([null, '12', '24']);

    const beforeDrift = requests.length;
    await filter(page).fill('drift');
    await expect(play(page, 'Drift 36')).toBeAttached();
    await expect(cards).toHaveCount(6);
    await expect(play(page, 'Loop 1')).toHaveCount(0);
    const driftPages = requests.slice(beforeDrift);
    expect(driftPages.map((r) => [r.url.searchParams.get('q'), r.url.searchParams.get('cursor')])).toEqual([
      ['drift', null],
    ]);
  });

  test('changing q aborts an in-flight load-more page (no stale rows appended)', async ({ page, context }) => {
    await signIn(context, PAGED_OWNER);
    let releaseHeld!: () => void;
    const held = new Promise<void>((resolve) => (releaseHeld = resolve));
    let heldSeen!: () => void;
    const heldRequest = new Promise<void>((resolve) => (heldSeen = resolve));
    await page.route(`${API_URL}/created?*`, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('q') === 'loop' && url.searchParams.get('cursor') === '12') {
        heldSeen();
        await held;
      }
      await route.continue().catch(() => {});
    });
    await page.goto('/created?q=loop');
    const cards = page.locator('#main').getByRole('button', { name: /^Play / });
    await expect(cards).toHaveCount(12);
    await cards.last().scrollIntoViewIfNeeded();
    await heldRequest;

    await filter(page).fill('drift');
    await expect(cards).toHaveCount(6);
    releaseHeld();
    await page.waitForTimeout(300);
    await expect(cards).toHaveCount(6);
    await expect(page.getByRole('button', { name: /^Play Loop / })).toHaveCount(0);
  });

  test('account switch and sign-out clear the query and results', async ({ page, context }) => {
    await signIn(context);
    const requests = recordCreatedRequests(page);
    await page.goto('/created?q=neon');
    await expect(play(page, 'Neon Private Sketch')).toBeVisible();

    const beforeSwitch = requests.length;
    await switchSession(page, context, OTHER_OWNER);
    await expect(play(page, 'Other Owner Neon Song')).toBeVisible();
    await expect(play(page, 'Neon Private Sketch')).toHaveCount(0);
    await expect(play(page, 'Neon Arcade Runner')).toHaveCount(0);
    await expect(filter(page)).toHaveValue('');
    await expect(page).toHaveURL('/created');
    // The other account never receives the previous account's query.
    const afterSwitch = requests.slice(beforeSwitch);
    expect(afterSwitch.length).toBeGreaterThan(0);
    for (const r of afterSwitch) {
      expect(await r.owner()).toBe(OTHER_OWNER);
      expect(r.url.searchParams.has('q')).toBe(false);
    }

    await filter(page).fill('other');
    await expect(page).toHaveURL('/created?q=other');
    await switchSession(page, context, null);
    await expect(page.getByRole('heading', { name: 'Sign in to see your songs' })).toBeVisible();
    await expect(filter(page)).toHaveCount(0);
    await expect(play(page, 'Other Owner Neon Song')).toHaveCount(0);
    await expect(page).toHaveURL('/created');
  });

  test("Back to /created after switching accounts on another page never sends the old account's q", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(context);
    const requests = recordCreatedRequests(page);
    await page.goto('/created');
    await expect(play(page, 'First Track')).toBeVisible();
    await filter(page).fill('Neon Private Sketch');
    await expect(page).toHaveURL('/created?q=Neon+Private+Sketch');
    await expect(page.locator('#main').getByRole('button', { name: /^Play / })).toHaveCount(1);

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Liked' }).click();
    await expect(page).toHaveURL('/liked');
    await expect(play(page, 'First Track')).toBeVisible();
    await switchSession(page, context, OTHER_OWNER);

    // Also covers Astro dev's hidden client:only pre-hydration iframe (its requests are recorded too).
    const beforeBack = requests.length;
    await page.goBack();
    await expect(play(page, 'Other Owner Neon Song')).toBeVisible();
    await expect(filter(page)).toHaveValue('');
    await expect(page).toHaveURL('/created');
    const afterBack = requests.slice(beforeBack);
    expect(afterBack.length).toBeGreaterThan(0);
    for (const r of afterBack) {
      expect(await r.owner()).toBe(OTHER_OWNER);
      expect(r.url.searchParams.has('q')).toBe(false);
    }
  });

  test('same-account Back to /created restores its filter', async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(context);
    const requests = recordCreatedRequests(page);
    await page.goto('/created?q=neon');
    await expect(play(page, 'Neon Private Sketch')).toBeVisible();

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Liked' }).click();
    await expect(page).toHaveURL('/liked');
    await expect(play(page, 'First Track')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL('/created?q=neon');
    await expect(filter(page)).toHaveValue('neon');
    await expect(play(page, 'Neon Private Sketch')).toBeVisible();
    await expect(play(page, 'First Track')).toHaveCount(0);
    expect(requests.at(-1)?.url.searchParams.get('q')).toBe('neon');
  });

  test('clearing a whitespace-only ?q= strips it from the URL', async ({ page, context }) => {
    await signIn(context);
    await page.goto('/created?q=%20%20');
    await expect(play(page, 'First Track')).toBeVisible();
    await expect(filter(page)).toHaveValue('  ');
    await page.getByRole('button', { name: 'Clear title filter' }).click();
    await expect(filter(page)).toHaveValue('');
    await expect(page).toHaveURL('/created');
  });

  test('a 100-character unbroken query wraps inside the empty state at 390px', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(context);
    const query = 'W'.repeat(100);
    await page.goto(`/created?q=${query}`);
    const message = page.getByText(`No created songs match “${query}”.`);
    await expect(message).toBeVisible();
    const box = await message.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const overflow = await message.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toBeInViewport();
  });

  test('signed out, Home and /liked render no filter', async ({ page, context }) => {
    await page.goto('/created');
    await expect(page.getByRole('heading', { name: 'Sign in to see your songs' })).toBeVisible();
    await expect(filter(page)).toHaveCount(0);

    await signIn(context);
    for (const path of ['/', '/liked']) {
      await page.goto(path);
      await expect(play(page, 'First Track')).toBeVisible();
      await expect(filter(page)).toHaveCount(0);
      await expect(page.getByRole('search')).toHaveCount(0);
    }
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`filter bar layout is clean at ${viewport.name} ${viewport.width}px`, async ({ page, context }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(context);
      await page.goto('/created?q=neon');
      await expect(play(page, 'Neon Arcade Runner')).toBeVisible();

      const input = await filter(page).boundingBox();
      const clear = await page.getByRole('button', { name: 'Clear title filter' }).boundingBox();
      const heading = await page.getByRole('heading', { name: 'Created', level: 1 }).boundingBox();
      expect(input && clear && heading).toBeTruthy();
      expect(input!.height).toBeGreaterThanOrEqual(44);
      expect(clear!.width).toBeGreaterThanOrEqual(44);
      expect(clear!.height).toBeGreaterThanOrEqual(44);
      // The clear button sits inside the input, the bar below the heading, all within the viewport.
      expect(clear!.x + clear!.width).toBeLessThanOrEqual(input!.x + input!.width + 0.5);
      expect(clear!.y).toBeGreaterThanOrEqual(input!.y - 0.5);
      expect(input!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
      expect(input!.x).toBeGreaterThanOrEqual(0);
      expect(input!.x + input!.width).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });
  }
});
