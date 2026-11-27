import { createServer, request as httpRequest, type Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

async function startSiblingOriginProxy(targetHost = '127.0.0.1', targetPort = 4328): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const server: Server = createServer((req, res) => {
    const upstream = httpRequest(
      {
        hostname: targetHost,
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${targetHost}:${targetPort}`,
        },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind sibling origin proxy');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

const API_URL = 'http://127.0.0.1:4329';
const FRONTEND_URL = 'http://127.0.0.1:4328';
const USER_CONTRACT = 'CFIXTUREUSER0000000000000000000000000000000000000000000001';
const USER_KEY_ID = 'fixture-key-1';

function makeSmolJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fixture-sig`;
}

function validSmolJwt(sub = USER_CONTRACT, key = USER_KEY_ID, ttlSeconds = 3600) {
  return makeSmolJwt({
    sub,
    key,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
}

function expiredSmolJwt(sub = USER_CONTRACT, key = USER_KEY_ID) {
  return makeSmolJwt({
    sub,
    key,
    exp: Math.floor(Date.now() / 1000) - 60,
  });
}

async function installPasskeyAuthSeam(
  page: Page,
  options: {
    contractId?: string;
    keyId?: string;
    failSendMessage?: string;
    deferCreateWallet?: boolean;
    deferSend?: boolean;
  } = {},
) {
  const cid = options.contractId ?? USER_CONTRACT;
  const kid = options.keyId ?? USER_KEY_ID;
  const failSendMessage = options.failSendMessage ?? null;
  const deferCreateWallet = options.deferCreateWallet ?? false;
  const deferSend = options.deferSend ?? false;

  await page.addInitScript(
    ({ cid, kid, failSendMessage, deferCreateWallet, deferSend }) => {
      (globalThis as unknown as { __smolAuthSeams?: unknown }).__smolAuthSeams = {
        connectWallet: async () => ({
          rawResponse: { id: kid, type: 'public-key' },
          keyIdBase64: kid,
          contractId: cid,
        }),
        createWallet: async () => {
          if (deferCreateWallet) {
            (
              globalThis as unknown as { __smolCreateWalletStarted?: boolean }
            ).__smolCreateWalletStarted = true;
            await new Promise<void>((resolve, reject) => {
              (
                globalThis as unknown as {
                  __smolFinishDeferredCreateWallet?: (err?: string) => void;
                }
              ).__smolFinishDeferredCreateWallet = (err?: string) => {
                if (err) reject(new Error(err));
                else resolve();
              };
            });
          }
          return {
            rawResponse: { id: kid, type: 'public-key' },
            keyIdBase64: kid,
            contractId: cid,
            signedTx: 'fixture-signed-xdr',
          };
        },
        send: async () => {
          if (deferSend) {
            await new Promise<void>((resolve, reject) => {
              (
                globalThis as unknown as {
                  __smolFinishDeferredSend?: (err?: string) => void;
                }
              ).__smolFinishDeferredSend = (err?: string) => {
                if (err) reject(new Error(err));
                else resolve();
              };
            });
          }
          if (failSendMessage) {
            throw new Error(failSendMessage);
          }
          return { status: 'SUCCESS' };
        },
      };
    },
    { cid, kid, failSendMessage, deferCreateWallet, deferSend },
  );
}

test.describe('Authentication and signed-in grids', () => {
  test('signed-out /liked -> sign in loads tracks without reload -> sign out clears immediately', async ({
    page,
  }) => {
    await installPasskeyAuthSeam(page);

    let fullPageLoads = 0;
    page.on('load', () => {
      fullPageLoads += 1;
    });

    await page.goto('/liked');
    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(page.getByText('No liked songs yet')).toHaveCount(0);

    // Mark the current document instance so we can assert no reload occurs during sign-in
    const loadsBeforeSignIn = fullPageLoads;
    await page.evaluate(() => {
      (window as unknown as { __smolSameDoc?: string }).__smolSameDoc = 'alive';
    });

    // Click Sign in CTA inside SmolGrid -> AuthSheet opens -> Sign in with passkey
    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Sign in to SMOL' })).toBeVisible();

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheet.getByRole('button', { name: 'Sign in with passkey' }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    expect(loginResponse.request().postDataJSON()).toMatchObject({
      type: 'connect',
      contractId: USER_CONTRACT,
      keyId: USER_KEY_ID,
    });
    expect(await loginResponse.headerValue('set-cookie')).toContain('smol_token=');

    // Must NOT reload the document and must NOT latch false "No liked songs yet"
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play Second Track' })).toBeVisible();
    await expect(page.getByText('No liked songs yet')).toHaveCount(0);
    expect(fullPageLoads).toBe(loadsBeforeSignIn);
    expect(
      await page.evaluate(() => (window as unknown as { __smolSameDoc?: string }).__smolSameDoc),
    ).toBe('alive');

    // Verify Set-Cookie / cookie persisted
    const cookiesAfterLogin = await page.context().cookies(FRONTEND_URL);
    expect(cookiesAfterLogin.some((c) => c.name === 'smol_token' && c.value.length > 0)).toBe(true);

    // Hold POST /logout briefly so we can verify SmolGrid clears private tracks BEFORE navigation to /
    let releaseLogout!: () => void;
    const logoutHeld = new Promise<void>((resolve) => {
      releaseLogout = resolve;
    });
    await page.route(`${API_URL}/logout`, async (route) => {
      await logoutHeld;
      await route.continue();
    });

    await page.getByRole('button', { name: 'Open account menu' }).click();
    const accountSheet = page.locator('dialog[open]');
    await accountSheet.getByRole('button', { name: 'Sign out' }).click();

    // Immediately while still on /liked, private tracks clear and signed-out prompt renders
    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play First Track' })).toHaveCount(0);

    releaseLogout();
    await expect(page).toHaveURL('/');

    // Returning to /liked confirms signed-out state persists
    await page.goto('/liked');
    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(page.getByText('No liked songs yet')).toHaveCount(0);
  });

  test('signed-out /created -> sign in loads tracks without reload -> sign out clears', async ({
    page,
  }) => {
    await installPasskeyAuthSeam(page);

    let fullPageLoads = 0;
    page.on('load', () => {
      fullPageLoads += 1;
    });

    await page.goto('/created');
    expect(fullPageLoads).toBe(1);
    await expect(page.getByRole('heading', { name: 'Sign in to see your songs' })).toBeVisible();

    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();

    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    await expect(page.getByText('No created songs yet')).toHaveCount(0);
    expect(fullPageLoads).toBe(1);

    // Sign out clears tracks immediately
    let releaseLogout!: () => void;
    const logoutHeld = new Promise<void>((resolve) => {
      releaseLogout = resolve;
    });
    await page.route(`${API_URL}/logout`, async (route) => {
      await logoutHeld;
      await route.continue();
    });

    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in to see your songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play First Track' })).toHaveCount(0);

    releaseLogout();
    await expect(page).toHaveURL('/');
  });

  test('create account omits provisional Set-Cookie during deploy and installs session only after deploy succeeds', async ({
    page,
    context,
  }) => {
    await installPasskeyAuthSeam(page, { deferSend: true });
    await page.goto('/liked');
    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();

    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheet = page.locator('dialog[open]');
    await sheet.getByText('Create account', { exact: true }).click();
    await sheet.getByLabel('Username').fill('smol-tester');

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheet.getByRole('button', { name: 'Create account' }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    expect(loginResponse.request().postDataJSON()).toMatchObject({
      type: 'create',
      contractId: USER_CONTRACT,
      keyId: USER_KEY_ID,
      username: 'smol-tester',
    });
    // Server returned Set-Cookie, but credentials: 'omit' prevented the browser from storing it pre-deploy!
    expect(await loginResponse.headerValue('set-cookie')).toContain('smol_token=');
    await page.waitForTimeout(100);
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();

    // Finish wallet relay -> now cookie is written and /liked loads without reload
    await page.evaluate(() => {
      (globalThis as unknown as { __smolFinishDeferredSend?: () => void }).__smolFinishDeferredSend?.();
    });
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    await expect(page.getByText('No liked songs yet')).toHaveCount(0);
    expect((await context.cookies(FRONTEND_URL)).some((c) => c.name === 'smol_token')).toBe(true);
  });

  test('failed signup relay installs zero cookies (no /logout needed) and reload stays logged out', async ({
    page,
    context,
  }) => {
    await installPasskeyAuthSeam(page, {
      failSendMessage: 'Relayer proxy error: Turnstile rejected',
    });

    let logoutCalls = 0;
    await page.route(`${API_URL}/logout`, async (route) => {
      logoutCalls += 1;
      await route.continue();
    });

    await page.goto('/liked');
    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheet = page.locator('dialog[open]');
    await sheet.getByText('Create account', { exact: true }).click();
    await sheet.getByLabel('Username').fill('failed-relay-user');

    const loginPromise = page.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheet.getByRole('button', { name: 'Create account' }).click();
    expect((await loginPromise).status()).toBe(200);

    await expect(sheet.getByRole('alert')).toContainText('Relayer proxy error: Turnstile rejected');
    await expect(page.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    expect(logoutCalls).toBe(0);
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();
  });

  test('closing a signup tab mid-deploy leaves zero unfinished session cookies across tabs', async ({
    context,
  }) => {
    const pendingContract = 'CPENDINGCLOSE000000000000000000000000000000000000000000001';
    const tabA = await context.newPage();
    await installPasskeyAuthSeam(tabA, {
      contractId: pendingContract,
      keyId: 'pending-close-key',
      deferSend: true,
    });

    await tabA.goto('/liked');
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheet = tabA.locator('dialog[open]');
    await sheet.getByText('Create account', { exact: true }).click();
    await sheet.getByLabel('Username').fill('closed-tab-user');

    const loginPromise = tabA.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheet.getByRole('button', { name: 'Create account' }).click();
    expect((await loginPromise).status()).toBe(200);

    // Closing the signup tab leaves no unfinished session in other tabs.
    await tabA.close();

    const tabB = await context.newPage();
    await tabB.goto('/liked');
    await expect(tabB.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();
    await tabB.close();
  });

  test('signup commits cleanly even when server returns 200 JWT body without Set-Cookie', async ({
    page,
    context,
  }) => {
    const noCookieContract = 'CNOCOOKIEHDR0000000000000000000000000000000000000000000001';
    const bodyOnlyJwt = validSmolJwt(noCookieContract, 'no-cookie-key');
    await installPasskeyAuthSeam(page, {
      contractId: noCookieContract,
      keyId: 'no-cookie-key',
    });
    await page.route(`${API_URL}/login`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': FRONTEND_URL,
          'Content-Type': 'text/plain',
        },
        body: bodyOnlyJwt,
      });
    });

    await page.goto('/liked');
    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheet = page.locator('dialog[open]');
    await sheet.getByText('Create account', { exact: true }).click();
    await sheet.getByLabel('Username').fill('no-setcookie-user');
    await sheet.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    const persisted = (await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token');
    expect(persisted?.value).toBe(bodyOnlyJwt);
  });

  test('another tab signing in during deploy preserves the other tab session and surfaces AuthSheet recovery alert', async ({
    context,
  }) => {
    const pendingContract = 'CPENDINGLATE0000000000000000000000000000000000000000000001';
    const otherContract = 'COTHERTABLATE000000000000000000000000000000000000000000002';

    const tabA = await context.newPage();
    await installPasskeyAuthSeam(tabA, {
      contractId: pendingContract,
      keyId: 'pending-late-key',
      deferSend: true,
    });

    const tabB = await context.newPage();
    await installPasskeyAuthSeam(tabB, {
      contractId: otherContract,
      keyId: 'other-late-key',
    });
    await tabB.goto('/liked');
    await expect(tabB.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();

    await tabA.goto('/liked');
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheetA = tabA.locator('dialog[open]');
    await sheetA.getByText('Create account', { exact: true }).click();
    await sheetA.getByLabel('Username').fill('late-deploy-user');

    const loginAPromise = tabA.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheetA.getByRole('button', { name: 'Create account' }).click();
    expect((await loginAPromise).status()).toBe(200);

    // Tab B signs into COTHER while Tab A's deploy is still pending
    await tabB.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    // Tab A's deploy now finishes -> must NOT overwrite COTHER's cookie, and shows AuthSheet recovery alert
    await tabA.evaluate(() => {
      (globalThis as unknown as { __smolFinishDeferredSend?: () => void }).__smolFinishDeferredSend?.();
    });
    await expect(sheetA.getByRole('alert')).toContainText(
      'Your passkey wallet was created, but another tab changed your session. Sign in with your passkey to continue.',
    );
    await expect(sheetA.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();

    const cookieAfterSwitch = (await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token');
    expect(cookieAfterSwitch?.value).toBeTruthy();
    const decodedSub = JSON.parse(
      Buffer.from(cookieAfterSwitch!.value.split('.')[1], 'base64url').toString('utf8'),
    ).sub;
    expect(decodedSub).toBe(otherContract);
    // Report 49 P2-4: Tab A reconciles to the LIVE shared session (Tab B's
    // sign-in) as soon as the auth transition arrives: never the uncommitted
    // pending wallet, never a stale signed-out shell.
    const pillA = tabA.getByRole('button', { name: /^Open account menu/ });
    await expect(pillA).toContainText(`${otherContract.slice(0, 6)}…${otherContract.slice(-4)}`);
    await expect(pillA).not.toContainText(`${pendingContract.slice(0, 6)}…${pendingContract.slice(-4)}`);

    await tabA.close();
    await tabB.close();
  });

  test('signup paused at passkey prompt (createWallet) preserves login made in another tab and shows passkey recovery alert', async ({
    context,
  }) => {
    const promptContract = 'CPROMPTSIGNUP000000000000000000000000000000000000000000001';
    const otherContract = 'COTHERPROMPT0000000000000000000000000000000000000000000002';

    const tabA = await context.newPage();
    await installPasskeyAuthSeam(tabA, {
      contractId: promptContract,
      keyId: 'prompt-key',
      deferCreateWallet: true,
    });

    const tabB = await context.newPage();
    await installPasskeyAuthSeam(tabB, {
      contractId: otherContract,
      keyId: 'other-prompt-key',
    });
    await tabB.goto('/liked');
    await expect(tabB.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();

    // Tab A submits signup and pauses inside createWallet() (the passkey prompt)
    await tabA.goto('/liked');
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheetA = tabA.locator('dialog[open]');
    await sheetA.getByText('Create account', { exact: true }).click();
    await sheetA.getByLabel('Username').fill('prompt-race-user');
    await sheetA.getByRole('button', { name: 'Create account' }).click();

    await tabA.waitForFunction(() =>
      Boolean((globalThis as unknown as { __smolCreateWalletStarted?: boolean }).__smolCreateWalletStarted),
    );

    // Tab B signs into otherContract while Tab A's passkey prompt is still open
    await tabB.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    // Release Tab A's passkey prompt -> POST /login + relay finish -> must keep Tab B's session!
    await tabA.evaluate(() => {
      (
        globalThis as unknown as { __smolFinishDeferredCreateWallet?: () => void }
      ).__smolFinishDeferredCreateWallet?.();
    });

    await expect(sheetA.getByRole('alert')).toContainText(
      'Your passkey wallet was created, but another tab changed your session. Sign in with your passkey to continue.',
    );
    await expect(sheetA.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();

    const liveCookie = (await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token');
    expect(liveCookie?.value).toBeTruthy();
    const decodedSub = JSON.parse(
      Buffer.from(liveCookie!.value.split('.')[1], 'base64url').toString('utf8'),
    ).sub;
    expect(decodedSub).toBe(otherContract);
    // Report 49 P2-4: Tab A follows the live shared session, never the prompt's wallet.
    const pillA = tabA.getByRole('button', { name: /^Open account menu/ });
    await expect(pillA).toContainText(`${otherContract.slice(0, 6)}…${otherContract.slice(-4)}`);
    await expect(pillA).not.toContainText(`${promptContract.slice(0, 6)}…${promptContract.slice(-4)}`);

    // Non-secret transition marker in localStorage never contains any JWT or contract ID
    const storedMarker = await tabA.evaluate(() => localStorage.getItem('smol_auth_transition'));
    expect(storedMarker).toBeTruthy();
    expect(storedMarker).not.toContain('.');
    expect(storedMarker).not.toContain(otherContract);
    expect(storedMarker).not.toContain(promptContract);

    await tabA.close();
    await tabB.close();
  });

  test('signup does NOT reverse sign-in + explicit sign-out in another tab even when cookies are empty again (including under storage quota)', async ({
    context,
  }) => {
    const pendingContract = 'CSIGNOUTRACE0000000000000000000000000000000000000000000001';
    const otherContract = 'COTHERSIGNOUT000000000000000000000000000000000000000000002';

    const tabA = await context.newPage();
    await installPasskeyAuthSeam(tabA, {
      contractId: pendingContract,
      keyId: 'signout-race-key',
      deferSend: true,
    });

    const tabB = await context.newPage();
    // Simulate QuotaExceededError on Tab B's localStorage.setItem so BroadcastChannel must carry the signal
    await tabB.addInitScript(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      };
    });
    await installPasskeyAuthSeam(tabB, {
      contractId: otherContract,
      keyId: 'other-signout-key',
    });
    await tabB.goto('/liked');
    await expect(tabB.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();

    // Tab A starts signup and pauses during wallet relay
    await tabA.goto('/liked');
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheetA = tabA.locator('dialog[open]');
    await sheetA.getByText('Create account', { exact: true }).click();
    await sheetA.getByLabel('Username').fill('signout-race-user');

    const loginAPromise = tabA.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheetA.getByRole('button', { name: 'Create account' }).click();
    expect((await loginAPromise).status()).toBe(200);

    // Tab B signs in AND explicitly clicks Sign out -> browser cookies are empty again!
    await tabB.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    await tabB.getByRole('button', { name: 'Open account menu' }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
    await expect(tabB).toHaveURL('/');
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();

    // Release Tab A's relay -> browser MUST stay signed out and Tab A shows passkey recovery alert
    await tabA.evaluate(() => {
      (globalThis as unknown as { __smolFinishDeferredSend?: () => void }).__smolFinishDeferredSend?.();
    });
    await expect(sheetA.getByRole('alert')).toContainText(
      'Your passkey wallet was created, but another tab changed your session. Sign in with your passkey to continue.',
    );
    await expect(sheetA.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();

    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);

    await tabA.reload();
    await expect(tabA.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);

    await tabA.close();
    await tabB.close();
  });

  test('two-origin cross-tab sign-in + explicit sign-out is observed via smol_auth_epoch cookie (no shared localStorage or BroadcastChannel)', async ({
    context,
  }) => {
    const proxy = await startSiblingOriginProxy();
    try {
      const pendingContract = 'CTWOORIGIN000000000000000000000000000000000000000000000001';
      const otherContract = 'CSIBLINGORIGIN00000000000000000000000000000000000000000002';

      const tabA = await context.newPage();
      await installPasskeyAuthSeam(tabA, {
        contractId: pendingContract,
        keyId: 'two-origin-a-key',
        deferSend: true,
      });

      const tabB = await context.newPage();
      await installPasskeyAuthSeam(tabB, {
        contractId: otherContract,
        keyId: 'two-origin-b-key',
      });

      // Tab A on primary origin starts signup and pauses during wallet relay
      await tabA.goto(`${FRONTEND_URL}/liked`);
      await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
      const sheetA = tabA.locator('dialog[open]');
      await sheetA.getByText('Create account', { exact: true }).click();
      await sheetA.getByLabel('Username').fill('two-origin-user');

      const loginAPromise = tabA.waitForResponse(
        (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
      );
      await sheetA.getByRole('button', { name: 'Create account' }).click();
      expect((await loginAPromise).status()).toBe(200);

      // Tab B on a genuinely different origin (different loopback port, isolated localStorage/BroadcastChannel, shared cookies)
      await tabB.goto(`${proxy.origin}/liked`);
      expect(await tabB.evaluate(() => window.location.origin)).toBe(proxy.origin);
      expect(await tabA.evaluate(() => window.location.origin)).toBe(FRONTEND_URL);
      expect(proxy.origin).not.toBe(FRONTEND_URL);

      await tabB.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
      await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
      await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();

      // Tab B explicitly signs out -> smol_token is empty again, but smol_auth_epoch updated
      await tabB.getByRole('button', { name: 'Open account menu' }).click();
      await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
      await expect(tabB).toHaveURL(`${proxy.origin}/`);
      await expect(tabB.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);

      const cookiesAfterBLogout = await context.cookies(FRONTEND_URL);
      expect(cookiesAfterBLogout.find((c) => c.name === 'smol_token')).toBeUndefined();
      const epochCookie = cookiesAfterBLogout.find((c) => c.name === 'smol_auth_epoch');
      expect(epochCookie?.value).toBeTruthy();
      expect(epochCookie!.value).not.toContain('.');
      expect(epochCookie!.value).not.toContain(otherContract);

      // Release Tab A's relay -> browser MUST stay signed out and Tab A shows passkey recovery alert
      await tabA.evaluate(() => {
        (globalThis as unknown as { __smolFinishDeferredSend?: () => void }).__smolFinishDeferredSend?.();
      });
      await expect(sheetA.getByRole('alert')).toContainText(
        'Your passkey wallet was created, but another tab changed your session. Sign in with your passkey to continue.',
      );
      await expect(sheetA.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();

      expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();
      await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);

      await tabA.reload();
      await expect(tabA.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
      await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);

      await tabA.close();
      await tabB.close();
    } finally {
      await proxy.close();
    }
  });

  test('denied window.localStorage getter (SecurityError) never breaks signup, login, logout POST /logout, or competing-tab detection', async ({
    context,
  }) => {
    const denyLocalStorage = () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    };

    const userContract = 'CSECURITYERR0000000000000000000000000000000000000000000001';
    const otherContract = 'CSECURITYOTHER00000000000000000000000000000000000000000002';

    // (a) Signup opens passkey prompt & completes, (b) Logout reaches POST /logout, (c) Login completes
    const page = await context.newPage();
    await page.addInitScript(denyLocalStorage);
    await installPasskeyAuthSeam(page, {
      contractId: userContract,
      keyId: 'sec-err-key',
    });

    await page.goto('/liked');
    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheet = page.locator('dialog[open]');
    await sheet.getByText('Create account', { exact: true }).click();
    await sheet.getByLabel('Username').fill('sec-err-user');
    await sheet.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();

    // Explicit logout must STILL call POST /logout and clear session
    const logoutPromise = page.waitForResponse(
      (res) => res.url() === `${API_URL}/logout` && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
    expect((await logoutPromise).status()).toBe(204);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();

    // Explicit login must complete cleanly
    await page.goto('/liked');
    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    // Sign out again before testing (d) competing login + logout under denied localStorage
    const logout2Promise = page.waitForResponse(
      (res) => res.url() === `${API_URL}/logout` && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
    expect((await logout2Promise).status()).toBe(204);
    await page.close();

    // (d) Cookie + BroadcastChannel fallback still detects competing login + sign-out under denied localStorage
    const tabA = await context.newPage();
    await tabA.addInitScript(denyLocalStorage);
    await installPasskeyAuthSeam(tabA, {
      contractId: userContract,
      keyId: 'sec-race-a',
      deferSend: true,
    });

    const tabB = await context.newPage();
    await tabB.addInitScript(denyLocalStorage);
    await installPasskeyAuthSeam(tabB, {
      contractId: otherContract,
      keyId: 'sec-race-b',
    });

    await tabA.goto('/liked');
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheetA = tabA.locator('dialog[open]');
    await sheetA.getByText('Create account', { exact: true }).click();
    await sheetA.getByLabel('Username').fill('sec-race-user');

    const loginAPromise = tabA.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheetA.getByRole('button', { name: 'Create account' }).click();
    expect((await loginAPromise).status()).toBe(200);

    await tabB.goto('/liked');
    await tabB.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    await tabB.getByRole('button', { name: 'Open account menu' }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
    await expect(tabB).toHaveURL('/');
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();

    await tabA.evaluate(() => {
      (globalThis as unknown as { __smolFinishDeferredSend?: () => void }).__smolFinishDeferredSend?.();
    });
    await expect(sheetA.getByRole('alert')).toContainText(
      'Your passkey wallet was created, but another tab changed your session. Sign in with your passkey to continue.',
    );
    expect((await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token')).toBeUndefined();

    await tabA.close();
    await tabB.close();
  });

  test('stale signup relay failure does NOT expire a newer login to the SAME account', async ({
    context,
  }) => {
    const sameContract = 'CSAMEACCOUNT0000000000000000000000000000000000000000000001';
    const tabA = await context.newPage();
    await installPasskeyAuthSeam(tabA, {
      contractId: sameContract,
      keyId: 'same-acct-key',
      deferSend: true,
    });

    const tabB = await context.newPage();
    await installPasskeyAuthSeam(tabB, {
      contractId: sameContract,
      keyId: 'same-acct-key',
    });
    await tabB.goto('/liked');

    // Tab A starts signup for sameContract
    await tabA.goto('/liked');
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    const sheetA = tabA.locator('dialog[open]');
    await sheetA.getByText('Create account', { exact: true }).click();
    await sheetA.getByLabel('Username').fill('same-acct-user');

    const signupLoginPromise = tabA.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await sheetA.getByRole('button', { name: 'Create account' }).click();
    expect((await signupLoginPromise).status()).toBe(200);

    // Tab B logs into the SAME contractId -> installs a valid session cookie
    const connectLoginPromise = tabB.waitForResponse(
      (res) => res.url() === `${API_URL}/login` && res.request().method() === 'POST',
    );
    await tabB.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    const newerJwt = await (await connectLoginPromise).text();
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    // Tab A's stale signup relay now FAILS -> must NOT touch Tab B's cookie!
    await tabA.evaluate(() => {
      (
        globalThis as unknown as { __smolFinishDeferredSend?: (err?: string) => void }
      ).__smolFinishDeferredSend?.('Relayer proxy error: stale failure');
    });
    await expect(sheetA.getByRole('alert')).toContainText('Relayer proxy error: stale failure');

    const liveCookie = (await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token');
    expect(liveCookie?.value).toBe(newerJwt);

    await tabB.reload();
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();
    await expect(tabB.getByRole('button', { name: 'Play First Track' })).toBeVisible();

    await tabA.close();
    await tabB.close();
  });

  test('stale in-flight /liked request is ignored if user signs out before it resolves', async ({
    page,
  }) => {
    await installPasskeyAuthSeam(page);

    let releaseLiked!: () => void;
    const likedHeld = new Promise<void>((resolve) => {
      releaseLiked = resolve;
    });
    let likedRequestStarted!: () => void;
    const likedStartedPromise = new Promise<void>((resolve) => {
      likedRequestStarted = resolve;
    });

    await page.route(`${API_URL}/liked*`, async (route) => {
      likedRequestStarted();
      await likedHeld;
      await route.continue();
    });

    let releaseLogout!: () => void;
    const logoutHeld = new Promise<void>((resolve) => {
      releaseLogout = resolve;
    });
    await page.route(`${API_URL}/logout`, async (route) => {
      await logoutHeld;
      await route.continue();
    });

    await page.goto('/liked');
    await page.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();

    await likedStartedPromise;

    // Sign out while GET /liked is still pending
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();

    // Release delayed /liked response — must be discarded and never render private tracks
    releaseLiked();
    await page.waitForTimeout(300);
    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play First Track' })).toHaveCount(0);

    releaseLogout();
    await expect(page).toHaveURL('/');
  });

  test('signed-in hard load on /liked and ViewTransitions navigation keep userState consistent', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await context.addCookies([
      { name: 'smol_token', value: validSmolJwt(), url: FRONTEND_URL },
    ]);

    await page.goto('/liked');
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    await expect(page.getByText('No liked songs yet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    // ViewTransitions navigation to /created keeps auth and loads created tracks
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Created' }).click();
    await expect(page).toHaveURL('/created');
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    await expect(page.getByText('No created songs yet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
  });

  test('two-tab sign-out & cookie expiry reconcile userState on ViewTransition navigation', async ({
    context,
  }) => {
    const tabA = await context.newPage();
    await tabA.setViewportSize({ width: 1280, height: 800 });
    await installPasskeyAuthSeam(tabA);

    // 1. Tab A loads anonymous /liked (persisted TopBar starts with _cid=null), then signs in
    await tabA.goto('/liked');
    await expect(tabA.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabA.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(tabA.getByRole('button', { name: 'Play First Track' })).toBeVisible();
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toBeVisible();

    // 2. Tab B opens in the same context and signs out
    const tabB = await context.newPage();
    await tabB.setViewportSize({ width: 1280, height: 800 });
    await tabB.goto('/');
    await expect(tabB.getByRole('button', { name: 'Open account menu' })).toBeVisible();
    await tabB.getByRole('button', { name: 'Open account menu' }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
    await expect(tabB.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await tabB.close();

    // 3. Report 49 P2-4: Tab A reconciles on the cross-tab sign-out itself (no
    //    navigation needed), then a ViewTransition to /created stays signed out.
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    await expect(tabA.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Created' })).toHaveCount(0);
    await tabA.evaluate(() => {
      const a = document.createElement('a');
      a.href = '/created';
      a.textContent = 'created';
      document.body.appendChild(a);
      a.click();
    });
    await expect(tabA).toHaveURL('/created');
    await expect(tabA.getByRole('heading', { name: 'Sign in to see your songs' })).toBeVisible();
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    await expect(tabA.locator('header').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    // 4. Expiry case: Tab A signs back in, cookie becomes expired, ViewTransition to /liked clears session
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabA.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(tabA.getByRole('button', { name: 'Play First Track' })).toBeVisible();

    await context.addCookies([
      { name: 'smol_token', value: expiredSmolJwt(), url: FRONTEND_URL },
    ]);

    // ViewTransition to /liked through a same-origin link that does not depend
    // on the signed-in header: the shell may ALREADY have read the expired
    // cookie and signed out (the header's deferred KALE-balance load
    // re-validates the live session right before it reads), which removes
    // the Primary nav's Liked link.
    await tabA.evaluate(() => {
      const a = document.createElement('a');
      a.href = '/liked';
      a.textContent = 'liked';
      document.body.appendChild(a);
      a.click();
    });
    await expect(tabA).toHaveURL('/liked');
    await expect(tabA.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);

    await tabA.close();
  });

  test('in-flight /created SSR response generated while signed in never restores account after another tab signs out', async ({
    context,
  }) => {
    const tabA = await context.newPage();
    await tabA.setViewportSize({ width: 1280, height: 800 });
    await installPasskeyAuthSeam(tabA);

    // 1. Tab A signs in on /liked
    await tabA.goto('/liked');
    await tabA.locator('#main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await tabA.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toBeVisible();
    const signedInCookie = (await context.cookies(FRONTEND_URL)).find((c) => c.name === 'smol_token');
    expect(signedInCookie?.value).toBeTruthy();

    // 2. Intercept /created on Tab A: fetch the real SSR HTML WHILE signed in, then hold it!
    let createdSsrFetched!: () => void;
    const createdSsrFetchedPromise = new Promise<void>((resolve) => {
      createdSsrFetched = resolve;
    });
    let releaseCreatedSsr!: () => void;
    const createdSsrHeld = new Promise<void>((resolve) => {
      releaseCreatedSsr = resolve;
    });

    await tabA.route(`${FRONTEND_URL}/created`, async (route) => {
      const response = await route.fetch({
        headers: {
          ...route.request().headers(),
          cookie: `smol_token=${signedInCookie!.value}`,
        },
      });
      const body = await response.text();
      expect(body).toContain(USER_CONTRACT);
      createdSsrFetched();
      await createdSsrHeld;
      await route.fulfill({ response, body });
    });

    const navClick = tabA
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Created' })
      .click();
    await createdSsrFetchedPromise;

    // 3. While /created's signed-in HTML is in flight, Tab B signs out!
    const tabB = await context.newPage();
    await tabB.setViewportSize({ width: 1280, height: 800 });
    await tabB.goto('/');
    await tabB.getByRole('button', { name: 'Open account menu' }).click();
    await tabB.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
    await expect(tabB.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await tabB.close();

    // 4. Release the older signed-in /created SSR document to Tab A
    releaseCreatedSsr();
    await navClick;

    await expect(tabA).toHaveURL('/created');
    await expect(tabA.getByRole('heading', { name: 'Sign in to see your songs' })).toBeVisible();
    await expect(tabA.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    await expect(tabA.locator('header').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    const cookies = await context.cookies(FRONTEND_URL);
    expect(cookies.find((c) => c.name === 'smol_token')).toBeUndefined();

    await tabA.close();
  });

  test('already-liked track on public feed cannot be inverted before delayed /likes settles, and toggling works accurately after', async ({
    page,
  }) => {
    await installPasskeyAuthSeam(page);

    const serverLikes = new Set<string>(['smol-1take']);

    let releaseLikes!: () => void;
    const likesHeld = new Promise<void>((resolve) => {
      releaseLikes = resolve;
    });
    let likesStarted!: () => void;
    const likesStartedPromise = new Promise<void>((resolve) => {
      likesStarted = resolve;
    });

    await page.route(`${API_URL}/likes`, async (route) => {
      if (route.request().method() === 'GET') {
        likesStarted();
        await likesHeld;
        await route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': FRONTEND_URL,
            'Access-Control-Allow-Credentials': 'true',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([...serverLikes]),
        });
        return;
      }
      await route.continue();
    });

    let putLikesCount = 0;
    await page.route(`${API_URL}/likes/*`, async (route) => {
      if (route.request().method() === 'PUT') {
        putLikesCount += 1;
        const id = decodeURIComponent(new URL(route.request().url()).pathname.slice('/likes/'.length));
        if (serverLikes.has(id)) serverLikes.delete(id);
        else serverLikes.add(id);
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': FRONTEND_URL,
            'Access-Control-Allow-Credentials': 'true',
          },
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();

    await page.locator('header').getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Sign in with passkey' }).click();
    await likesStartedPromise;

    const likedCard = page.locator('#main article').filter({ hasText: 'Velvet Rain Echo' }).first();
    const unlikedCard = page.locator('#main article').filter({ hasText: 'First Track' }).first();
    const pendingHeart = likedCard.locator('button[aria-pressed]');
    await expect(pendingHeart).toBeDisabled();
    await expect(pendingHeart).toHaveAttribute('aria-busy', 'true');
    expect(putLikesCount).toBe(0);

    releaseLikes();
    const unlikeBtn = likedCard.getByRole('button', { name: 'Unlike', exact: true });
    const likeBtn = unlikedCard.getByRole('button', { name: 'Like', exact: true });
    await expect(unlikeBtn).toBeEnabled();
    await expect(unlikeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(likeBtn).toBeEnabled();
    await expect(likeBtn).toHaveAttribute('aria-pressed', 'false');

    await unlikeBtn.click();
    await expect(likedCard.getByRole('button', { name: 'Like', exact: true })).toBeVisible();
    expect(serverLikes.has('smol-1take')).toBe(false);

    await likeBtn.click();
    await expect(unlikedCard.getByRole('button', { name: 'Unlike', exact: true })).toBeVisible();
    expect(serverLikes.has('first-smol')).toBe(true);
    expect(putLikesCount).toBe(2);
  });

  test('failed GET /likes (503) keeps unknown hearts disabled and Retry likes recovers exact server state', async ({
    page,
    context,
  }) => {
    const serverLikes = new Set<string>(['smol-1take']);
    let likesShouldFail = true;
    let putLikesCount = 0;

    await page.route(`${API_URL}/likes`, async (route) => {
      if (route.request().method() === 'GET') {
        if (likesShouldFail) {
          await route.fulfill({
            status: 503,
            headers: {
              'Access-Control-Allow-Origin': FRONTEND_URL,
              'Access-Control-Allow-Credentials': 'true',
              'Content-Type': 'text/plain',
            },
            body: 'Likes temporarily unavailable',
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': FRONTEND_URL,
            'Access-Control-Allow-Credentials': 'true',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([...serverLikes]),
        });
        return;
      }
      await route.continue();
    });

    await page.route(`${API_URL}/likes/*`, async (route) => {
      if (route.request().method() === 'PUT') {
        putLikesCount += 1;
        const id = decodeURIComponent(new URL(route.request().url()).pathname.slice('/likes/'.length));
        if (serverLikes.has(id)) serverLikes.delete(id);
        else serverLikes.add(id);
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': FRONTEND_URL,
            'Access-Control-Allow-Credentials': 'true',
          },
        });
        return;
      }
      await route.continue();
    });

    await context.addCookies([
      { name: 'smol_token', value: validSmolJwt(), url: FRONTEND_URL },
    ]);

    await page.goto('/');
    const likedCard = page.locator('#main article').filter({ hasText: 'Velvet Rain Echo' }).first();
    await expect(likedCard).toBeVisible();

    const retryBtn = page.getByRole('button', { name: 'Retry likes' });
    await expect(retryBtn).toBeVisible();
    const disabledHeart = likedCard.locator('button[aria-pressed]');
    await expect(disabledHeart).toBeDisabled();
    expect(putLikesCount).toBe(0);

    likesShouldFail = false;
    await retryBtn.click();

    await expect(retryBtn).toHaveCount(0);
    const unlikeBtn = likedCard.getByRole('button', { name: 'Unlike', exact: true });
    await expect(unlikeBtn).toBeEnabled();
    await expect(unlikeBtn).toHaveAttribute('aria-pressed', 'true');

    await unlikeBtn.click();
    await expect(likedCard.getByRole('button', { name: 'Like', exact: true })).toBeVisible();
    expect(serverLikes.has('smol-1take')).toBe(false);
    expect(putLikesCount).toBe(1);
  });
});

test.describe('Layout JWT exp validation, malformed percent-encoding, stale cookie deletion & Cache-Control', () => {
  test('valid smol_token sets Cache-Control: private, no-store and hydrates session', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'smol_token', value: validSmolJwt(), url: FRONTEND_URL },
    ]);

    const response = await page.goto('/liked');
    const allHeaders = await response!.allHeaders();
    expect(allHeaders['cache-control']).toBe('private, no-store');
    expect(allHeaders['set-cookie'] ?? '').not.toContain('Max-Age=0');
    expect(allHeaders['set-cookie'] ?? '').not.toContain('1970');

    await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible();
  });

  test('expired smol_token is rejected, deleted server-side, and returns private no-store', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'smol_token', value: expiredSmolJwt(), url: FRONTEND_URL },
    ]);

    const response = await page.goto('/liked');
    const allHeaders = await response!.allHeaders();
    expect(allHeaders['cache-control']).toBe('private, no-store');

    const setCookie = (await response!.headerValues('set-cookie')).join('\n');
    expect(setCookie).toContain('smol_token=');
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain=.smol.xyz');

    await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    const remainingCookies = await context.cookies(FRONTEND_URL);
    expect(remainingCookies.find((c) => c.name === 'smol_token')).toBeUndefined();
  });

  test('malformed smol_token or token missing exp is rejected and deleted server-side', async ({
    page,
    context,
  }) => {
    for (const badToken of [
      'not-a-valid-jwt',
      makeSmolJwt({ sub: USER_CONTRACT, key: USER_KEY_ID }),
    ]) {
      await context.addCookies([
        { name: 'smol_token', value: badToken, url: FRONTEND_URL },
      ]);

      const response = await page.goto('/liked');
      const allHeaders = await response!.allHeaders();
      expect(allHeaders['cache-control']).toBe('private, no-store');
      const setCookie = (await response!.headerValues('set-cookie')).join('\n');
      expect(setCookie).toContain('smol_token=');
      expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

      await expect(page.getByRole('heading', { name: 'Sign in to see liked songs' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
    }
  });

  test('invalid percent-encoded smol_token renders 200 without throwing, sets private no-store, and deletes cookie on both / and /[id]', async ({
    request,
  }) => {
    for (const routePath of ['/', '/smol-2take']) {
      const response = await request.get(`${FRONTEND_URL}${routePath}`, {
        headers: {
          Cookie: 'smol_token=%E0%A4%A; unrelated=ok',
        },
      });

      expect(response.status(), `${routePath} must render 200 on invalid percent-encoded cookie`).toBe(200);
      expect(response.headers()['cache-control']).toBe('private, no-store');

      const setCookies = response
        .headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value)
        .join('\n');
      expect(setCookies).toContain('smol_token=');
      expect(setCookies).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
      expect(setCookies).toContain('Path=/');
      expect(setCookies).not.toContain('Domain=.smol.xyz');

      const html = await response.text();
      expect(html).toMatch(/TopBar\.svelte[^>]*props="[^"]*&quot;_cid&quot;:\[0,null\]/);
      expect(html).toMatch(/TopBar\.svelte[^>]*props="[^"]*&quot;_kid&quot;:\[0,null\]/);
    }
  });

  test('anonymous request without smol_token (even with smol_auth_epoch) does not emit cookie deletion, private no-store, or SSR cookie forwarding', async ({
    page,
    request,
  }) => {
    const response = await page.goto('/');
    const allHeaders = await response!.allHeaders();
    expect(allHeaders['cache-control'] ?? '').not.toContain('no-store');
    expect((await response!.headerValues('set-cookie')).join('\n')).not.toContain('smol_token=');

    const epochValue = `1750000000-9-${Date.now()}`;
    const before: { seq: number; entries: { seq: number; path: string; cookie: string }[] } = await (
      await request.get(`${API_URL}/__ssr-cookies`)
    ).json();

    const anonHomeWithEpoch = await request.get(`${FRONTEND_URL}/`, {
      headers: { Cookie: `smol_auth_epoch=${epochValue}` },
    });
    expect(anonHomeWithEpoch.status()).toBe(200);
    expect(anonHomeWithEpoch.headers()['cache-control'] ?? '').not.toContain('no-store');

    const anonSongWithEpoch = await request.get(`${FRONTEND_URL}/smol-2take`, {
      headers: { Cookie: `smol_auth_epoch=${epochValue}` },
    });
    expect(anonSongWithEpoch.status()).toBe(200);
    expect(anonSongWithEpoch.headers()['cache-control'] ?? '').not.toContain('no-store');

    const after: { seq: number; entries: { seq: number; path: string; cookie: string }[] } = await (
      await request.get(`${API_URL}/__ssr-cookies`)
    ).json();
    const songHits = after.entries.filter((e) => e.seq > before.seq && e.path === '/smol-2take');
    expect(songHits.length).toBeGreaterThan(0);
    expect(songHits.some((e) => e.cookie.includes(epochValue) || e.cookie.includes('smol_auth_epoch'))).toBe(false);
  });
});

test('document-only SSR cookie forwarding: only /[id] forwards smol_token, never public SSR routes', async ({
  request,
}) => {
  const uniqueSub = `CSSRCOOKIECHECK${Date.now()}`.padEnd(56, '0');
  const jwt = validSmolJwt(uniqueSub, 'ssr-cookie-key');
  const encodedJwt = encodeURIComponent(jwt);
  const cookieHeader = `smol_token=${jwt}; other_cookie=must-not-forward`;

  const before: { seq: number; entries: { seq: number; path: string; cookie: string }[] } = await (
    await request.get(`${API_URL}/__ssr-cookies`)
  ).json();
  const startSeq = before.seq;

  const docRoutes = [
    '/mixtapes',
    '/mixtapes/fixture-mixtape',
    '/artists/fixture-artist',
    '/playlist/arcade',
    '/smol-2take',
  ];

  for (const routePath of docRoutes) {
    const res = await request.get(`${FRONTEND_URL}${routePath}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(res.status(), `${routePath} document SSR should succeed`).toBe(200);
    expect(res.headers()['cache-control']).toBe('private, no-store');
  }

  const after: { seq: number; entries: { seq: number; path: string; cookie: string }[] } = await (
    await request.get(`${API_URL}/__ssr-cookies`)
  ).json();
  const newEntries = after.entries.filter((e) => e.seq > startSeq);

  for (const publicApiPath of [
    '/mixtapes',
    '/mixtapes/fixture-mixtape',
    '/artists/fixture-artist/smols',
    '/playlist/arcade',
  ]) {
    const entries = newEntries.filter((e) => e.path === publicApiPath);
    expect(entries.length, `expected document-only SSR hit on ${publicApiPath}`).toBeGreaterThan(0);
    expect(
      entries.some((e) => e.cookie.includes(encodedJwt) || e.cookie.includes('other_cookie')),
      `${publicApiPath} must not forward any cookies`,
    ).toBe(false);
  }

  const songEntries = newEntries.filter((e) => e.path === '/smol-2take');
  expect(songEntries.length, 'expected document-only SSR hit on /smol-2take').toBeGreaterThan(0);
  expect(
    songEntries.some(
      (e) =>
        e.cookie.includes(`smol_token=${encodedJwt}`) &&
        !e.cookie.includes('other_cookie'),
    ),
    '/[id] document SSR must forward smol_token alone',
  ).toBe(true);
});
