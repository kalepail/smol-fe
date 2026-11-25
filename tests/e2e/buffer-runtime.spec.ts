import { expect, test, type Page } from '@playwright/test';
import { COLLECTOR, crosswiredSong } from '../fixtures/collect.mjs';
import { installStellarMock } from './helpers/stellarMock';

// FE-1 deliverable 2: vite-plugin-node-polyfills is gone. Buffer is provided only
// by src/utils/bufferGlobal.ts inside the lazy chain/wallet modules. This drives
// every lazy module that touches a bare global `Buffer` (SDK contract Spec,
// rpc, base64url inside passkey-kit) and fails on any page error.
const KALE = (n: number) => BigInt(n) * 10_000_000n;

function fakeJwt(sub: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub, key: 'fixture-key-1', exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Buffer is not defined|ReferenceError/.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}

test('no "Buffer is not defined" across the lazy chain + wallet modules', async ({ page, context }) => {
  const errors = collectErrors(page);
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(COLLECTOR), url: 'http://127.0.0.1:4328' }]);
  await installStellarMock(page, () => ({
    minted: [crosswiredSong.Id],
    balances: {},
    kale: 0n,
    kaleReserve: KALE(1_000),
    kaleByHolder: { [COLLECTOR]: KALE(100) },
  }));

  // Shell: no Buffer global is installed before any chain module loads.
  await page.goto('/');
  // Header KALE read: ledgerKeys + batchLedgerEntries (SDK xdr / rpc).
  await expect(page.getByRole('button', { name: /Open account menu/i })).toHaveAttribute('title', '100 KALE', {
    timeout: 15_000,
  });

  // Trade sheet: comet-sdk Client → contract Spec (bare Buffer.from on base64 spec entries).
  await page.goto(`/${crosswiredSong.Id}`);
  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('textbox').first().fill('5');
  await expect(dialog.locator('[data-minimum-received]')).toBeVisible({ timeout: 10_000 });

  // Wallet module: passkey-kit subpaths + sac-sdk Spec + base64url key decoding
  // (connectWallet derives the contract id, then fails on the empty mock RPC).
  const result = await page.evaluate(async () => {
    // Vite dev serves source modules; a variable keeps the specifier browser-only.
    const wrapper = '/src/utils/passkey-kit.ts';
    const mod = (await import(/* @vite-ignore */ wrapper)) as {
      kale: unknown;
      account: { connectWallet(opts: { keyId: string }): Promise<unknown> };
    };
    const out: { kale: boolean; connect: string } = { kale: Boolean(mod.kale), connect: '' };
    try {
      await mod.account.connectWallet({ keyId: 'ESIzRFVmd4iZAKq7zN3u_w' });
      out.connect = 'connected';
    } catch (error) {
      out.connect = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    return out;
  });
  expect(result.kale).toBe(true);
  expect(result.connect).toBe('Error: Failed to connect wallet');

  expect(errors).toEqual([]);
});

test('the signed-out shell never installs a Buffer global (polyfill stays in the lazy chain modules)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => typeof (globalThis as { Buffer?: unknown }).Buffer)).toBe('undefined');
  expect(errors).toEqual([]);
});
