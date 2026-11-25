// Built-Worker smoke test (playwright.worker.config.ts only; `pnpm test:e2e` ignores this file):
// the production `astro build` in workerd, Workers Static Assets + public/_headers, and SSR data
// over the real SMOL_API service binding (stubbed smol-workflow -> tests/fixtures/api.mjs).
import { readdirSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const FIXTURE_API = 'http://127.0.0.1:4339';
const PUBLIC_SONG = '/025d00727202437e4a2cba22ed3e0b9a5e39daaa09ed7fc550e6b0ff742f00eb';

const bindingRequests = async (request: APIRequestContext): Promise<string[]> =>
  (await request.get(`${FIXTURE_API}/__binding-requests`)).json();

/** The production client calls https://api.smol.xyz: serve it from the fixture API instead. */
async function browserApiCalls(page: Page): Promise<string[]> {
  const calls: string[] = [];
  await page.route('https://api.smol.xyz/**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname);
    await route.fulfill({ response: await route.fetch({ url: `${FIXTURE_API}${url.pathname}${url.search}` }) });
  });
  return calls;
}

test('/ is full SSR HTML; hashed /_astro JS is served immutable by Static Assets', async ({ request }) => {
  const home = await request.get('/');
  expect(home.status()).toBe(200);
  const html = await home.text();
  expect(html).toMatch(/^<!DOCTYPE html>/i);
  expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
  const scripts = [...new Set(html.match(/\/_astro\/[\w.-]+\.js/g))];
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    const asset = await request.get(script);
    expect(asset.status(), script).toBe(200);
    expect(asset.headers()['cache-control'], script).toContain('immutable');
  }
  const aasa = await request.get('/.well-known/apple-app-site-association');
  expect(aasa.status()).toBe(200);
  expect(aasa.headers()['content-type']).toBe('application/json');
});

test('song and mixtape SSR go through the SMOL_API binding; unknown songs are real 404s', async ({ request }) => {
  const before = (await bindingRequests(request)).length;
  expect((await request.get(PUBLIC_SONG)).status()).toBe(200);
  expect((await request.get(`/${'f'.repeat(64)}`)).status()).toBe(404);
  expect((await request.get('/mixtapes')).status()).toBe(200);
  const viaBinding = (await bindingRequests(request)).slice(before);
  expect(viaBinding).toEqual(expect.arrayContaining([PUBLIC_SONG, `/${'f'.repeat(64)}`, '/mixtapes']));
});

test('a malformed smol_token gets 200, private no-store, and a deletion Set-Cookie', async ({ request }) => {
  const response = await request.get(PUBLIC_SONG, { headers: { cookie: 'smol_token=%E0%A4%A' } });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  const cookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
  expect(cookies.some((value) => /^smol_token=deleted;.*Expires=Thu, 01 Jan 1970/.test(value)), cookies.join(' | ')).toBe(true);
});

test('/quota is a 404 "Song not found" with zero /quota API calls after hydration', async ({ page, request }) => {
  const before = (await bindingRequests(request)).length;
  const calls = await browserApiCalls(page);
  const response = await page.goto('/quota', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Song not found').first()).toBeVisible();
  expect((await bindingRequests(request)).slice(before)).not.toContain('/quota');
  expect(calls).not.toContain('/quota');
});

test('the lazy wallet chunk loads in Chromium with zero console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  await browserApiCalls(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  const wallet = readdirSync('dist/client/_astro').find((file) => /^passkey-kit\.[\w-]+\.js$/.test(file));
  expect(wallet, 'passkey-kit wallet chunk in dist/client/_astro').toBeTruthy();
  const exports = await page.evaluate(async (src) => Object.keys(await import(src)), `/_astro/${wallet}`);
  expect(exports.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
