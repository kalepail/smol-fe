import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installStellarMock } from './helpers/stellarMock';
import { CHAIN_OWNER, CHAIN_TRACK_INDEXED, CHAIN_TRACK_UNINDEXED } from '../fixtures/ownerChain.mjs';

/**
 * Mixtape dedupe + owner management (MIXTAPE_DEDUPE_SPEC.md, Report 24).
 * Each test signs in as its own fixture owner `CMIXOWNER<TAG>`, whose cohort
 * (ids `mx-<tag>-*`) is seeded lazily by tests/fixtures/ownerMixtapes.mjs:
 *   creasy-v2   "Creasy Drops"     3 songs  listed
 *   creasy-v1   "Creasy Drops"     1 song   hidden · superseded by creasy-v2
 *   night-drive "Night Drive"      3 songs  listed
 *   solo        "One Song Wonder"  1 song   hidden · too_few
 *   bagel       "Everything Bagel" 99 songs listed
 *   old-merged  merged into night-drive (404 mixtape_merged)
 */

const api = 'http://127.0.0.1:4329';
const RENDERS = process.env.MIXTAPE_OWNER_RENDERS ?? join('test-results', 'mixtape-owner-renders');

function fakeSmolJwt(sub: string, extra: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, key: `key-${sub}`, ...extra })).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function signInAs(context: BrowserContext, tag: string) {
  await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(`CMIXOWNER${tag.toUpperCase()}`), url: 'http://127.0.0.1:4328' }]);
  return (slug: string) => `mx-${tag}-${slug}`;
}

async function capture(page: Page, name: string) {
  mkdirSync(RENDERS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(RENDERS, name), fullPage: false });
}

const toasts = (page: Page) => page.locator('.toast-stack [role="status"]');
/** Desktop (lg+) builder = non-modal docked panel; mobile = bottom-sheet dialog. */
const panel = (page: Page) => page.locator('aside[data-mixtape-panel]');
const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4328', 'Access-Control-Allow-Credentials': 'true' };
const ownerSnapshot = async (page: Page, tag: string) =>
  (await (await page.request.get(`${api}/__owner/${tag}`)).json()) as Array<{ Id: string; Title: string; Desc: string; Smols: string[]; Revision: number; Deleted_At: string | null }>;

/** "Another client" (same account, other device) edits a mixtape straight through the API. */
async function remoteEdit(page: Page, tag: string, id: string, change: (row: { Title: string; Desc: string; Smols: string[] }) => { title?: string; smols?: string[] }) {
  const row = (await ownerSnapshot(page, tag)).find((r) => r.Id === id)!;
  const next = change(row);
  const res = await page.request.put(`${api}/mixtapes/${id}`, {
    data: { title: next.title ?? row.Title, desc: row.Desc, smols: next.smols ?? row.Smols, expectedRevision: row.Revision },
  });
  expect(res.status()).toBe(200);
}
const openDialog = (page: Page, text?: string | RegExp) =>
  text ? page.locator('dialog[open]').filter({ hasText: text }) : page.locator('dialog[open]');

async function seedDraft(page: Page, draft: { title: string; description?: string; tracks: Array<{ id: string; title: string }> }) {
  await page.goto('/');
  await page.evaluate((d) => {
    localStorage.setItem(
      'smol:mixtape-draft',
      JSON.stringify({
        draftId: 'draft-e2e',
        title: d.title,
        description: d.description ?? '',
        tracks: d.tracks.map((t) => ({ id: t.id, title: t.title, coverUrl: null, creator: null, public: 1 })),
        updatedAt: new Date().toISOString(),
      })
    );
    localStorage.removeItem('smol:mixtape-edit');
  }, draft);
  await page.reload();
}

test.describe('Mixtape owner management (390×844)', () => {
  test('All | Yours: All lists only public mixtapes; Yours splits Listed / Hidden with reasons and ⋯ menus', async ({ page, context, browser }) => {
    await signInAs(context, 'a1');
    await page.goto('/mixtapes');

    const views = page.getByRole('navigation', { name: 'Mixtape views' });
    // Generous first wait: this can be the first page the dev server compiles.
    await expect(views.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page', { timeout: 20_000 });
    // All = exactly what the public sees: one "Creasy Drops", never the hidden copy or the 1-song mixtape.
    const main = page.locator('main');
    await expect(main.locator('article h2', { hasText: 'Creasy Drops' })).toHaveCount(1);
    await expect(main.locator('article h2', { hasText: 'One Song Wonder' })).toHaveCount(0);

    await views.getByRole('link', { name: /Yours/ }).click();
    await expect(page).toHaveURL(/\/mixtapes\?view=yours$/);
    await expect(page.getByRole('heading', { name: /^Listed/ })).toContainText('(3)');
    const hiddenSection = page.locator('section', { has: page.getByRole('heading', { name: /Hidden from the Mixtapes page/ }) });
    await expect(hiddenSection.getByRole('heading', { name: /Hidden from the Mixtapes page/ })).toContainText('(2)');
    await expect(hiddenSection.getByText('Only you can see these.', { exact: false })).toBeVisible();

    const hiddenCopy = hiddenSection.locator('[data-mixtape-card="mx-a1-creasy-v1"]');
    await expect(hiddenCopy.getByText('Hidden', { exact: true })).toBeVisible();
    await expect(hiddenCopy.getByText('Already in "Creasy Drops"')).toBeVisible();
    await expect(hiddenCopy.getByRole('link')).toHaveAccessibleName('Creasy Drops, hidden from the Mixtapes page: Already in "Creasy Drops"');
    await expect(hiddenSection.locator('[data-mixtape-card="mx-a1-solo"]').getByText('Needs 1 more song')).toBeVisible();

    await hiddenCopy.getByRole('button', { name: 'More actions for Creasy Drops' }).click();
    const menu = page.getByRole('menu', { name: 'More actions for Creasy Drops' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Edit', 'Merge into "Creasy Drops"', 'Delete this copy']);
    await capture(page, 'yours-menu-390.png');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // Account sheet deep-links to Yours and surfaces the hidden count.
    await page.getByRole('button', { name: 'You and library' }).click();
    const sheet = openDialog(page, 'Your library');
    await expect(sheet.getByRole('link', { name: /Your mixtapes/ })).toContainText('2 hidden from the Mixtapes page');
    await expect(sheet.getByRole('link', { name: /Your mixtapes/ })).toHaveAttribute('href', '/mixtapes?view=yours');
    await sheet.getByRole('button', { name: 'Close' }).click();

    // Signed out: ?view=yours falls back to All and asks to sign in.
    const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const anonPage = await anon.newPage();
    await anonPage.goto('/mixtapes?view=yours');
    await expect(anonPage.locator('dialog[open]')).toContainText('Sign in to see your mixtapes.');
    await expect(anonPage).toHaveURL(/\/mixtapes$/);
    await anon.close();
  });

  test('hidden mixtape: owner callout explains why + 1-click actions; non-owner sees none and the page is noindex', async ({ page, context, browser }) => {
    const id = await signInAs(context, 'a2');
    const response = await page.goto(`/mixtapes/${id('creasy-v1')}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');

    const callout = page.locator('section[data-owner-callout]');
    await expect(callout.getByRole('heading', { name: 'Hidden from the Mixtapes page' })).toBeVisible();
    await expect(callout).toHaveAttribute('aria-labelledby', /owner-callout-title/);
    // Exact backend reason + fix (smol-workflow mixtapeAdvice), stated once.
    await expect(callout.locator('[data-owner-callout-advice]')).toHaveText(
      'Every song here is also in your bigger mixtape “Creasy Drops”, so that one is shown on the Mixtapes page instead. Add a song that isn’t in “Creasy Drops” to list this one too, or merge them. Your link still works.'
    );
    await expect(callout.locator('[data-owner-callout-why]')).toHaveCount(0);
    await expect(callout.getByRole('link', { name: /Creasy Drops/ })).toHaveAttribute('href', `/mixtapes/${id('creasy-v2')}`);
    await expect(callout.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(callout.getByRole('button', { name: 'Delete this copy' })).toBeVisible();
    // Every song is already in the match, so a merge would add nothing: offered as "Delete this copy" instead.
    await expect(callout.getByRole('button', { name: /Merge into/ })).toHaveCount(0);
    await expect(callout.getByText('Only you can see this note.')).toBeVisible();
    await expect(page.locator('[data-owner-status="hidden"]')).toHaveText('Hidden');
    await capture(page, 'detail-hidden-owner-390.png');

    // Non-owner: same playable link, zero owner chrome, still noindex.
    const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const anonPage = await anon.newPage();
    await anonPage.goto(`/mixtapes/${id('creasy-v1')}`);
    await expect(anonPage.getByRole('heading', { name: 'Creasy Drops', level: 1 })).toBeVisible();
    await expect(anonPage.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(anonPage.locator('[data-owner-callout]')).toHaveCount(0);
    await expect(anonPage.locator('[data-owner-status]')).toHaveCount(0);
    await expect(anonPage.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await anon.close();

    // Owner, listed: Listed chip + Edit + ⋯, no callout, indexable as usual.
    await page.goto(`/mixtapes/${id('creasy-v2')}`);
    await expect(page.locator('[data-owner-status="listed"]')).toHaveText('Listed');
    await expect(page.locator('[data-owner-callout]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', 'noindex');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'More actions for Creasy Drops' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Merge into another mixtape', 'Copy link', 'Delete mixtape']);
  });

  test('merged link: SSR 307 to the target with ?merged=1 and a toast', async ({ page, context }) => {
    const id = await signInAs(context, 'a8');
    const response = await page.goto(`/mixtapes/${id('old-merged')}`);
    expect(response?.request().redirectedFrom()?.url()).toContain(`/mixtapes/${id('old-merged')}`);
    expect((await response?.request().redirectedFrom()?.response())?.status()).toBe(307);
    await expect(page).toHaveURL(new RegExp(`/mixtapes/${id('night-drive')}$`));
    await expect(page.getByRole('heading', { name: 'Night Drive', level: 1 })).toBeVisible();
    await expect(toasts(page).filter({ hasText: 'merged into "Night Drive"' })).toBeVisible();

    // Unknown / deleted mixtapes stay a real 404.
    const missing = await page.goto(`/mixtapes/${id('does-not-exist')}`);
    expect(missing?.status()).toBe(404);
  });

  test('builder: duplicate coaching strip → "Edit X instead" switches to edit mode, Cancel restores the draft', async ({ page, context }) => {
    await signInAs(context, 'a3');
    await seedDraft(page, {
      title: 'Creasy again',
      tracks: [
        { id: 'first-smol', title: 'First Track' },
        { id: 'second-smol', title: 'Second Track' },
      ],
    });
    await page.getByRole('button', { name: 'Open mixtape draft (2)' }).click();
    const builder = openDialog(page, 'Creasy again');
    const strip = builder.locator('[data-mixtape-coaching]');
    await expect(strip).toHaveAttribute('aria-live', 'polite');
    await expect(strip).toContainText('Heads up: this matches your mixtape "Creasy Drops".');
    await expect(builder.getByRole('button', { name: 'Publish anyway' })).toBeEnabled();
    await expect(strip).toContainText('All 2 songs are already in it.');
    await capture(page, 'builder-coaching-390.png');

    await builder.getByRole('button', { name: 'Edit "Creasy Drops" instead' }).click();
    const editor = openDialog(page, 'Editing · Creasy Drops');
    await expect(editor.getByRole('heading', { name: 'Editing · Creasy Drops' })).toBeVisible();
    await expect(editor.getByText('3 songs selected')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'Delete mixtape' })).toBeVisible();

    // Cancel returns to the untouched create draft.
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(openDialog(page, 'Creasy again').getByRole('heading', { name: 'Creasy again' })).toBeVisible();
    const slots = await page.evaluate(() => ({
      draft: JSON.parse(localStorage.getItem('smol:mixtape-draft') || '{}').tracks?.length,
      edit: localStorage.getItem('smol:mixtape-edit:CMIXOWNERA3'),
    }));
    expect(slots).toEqual({ draft: 2, edit: null });
  });

  test('edit mode: Save disabled until dirty, relists a hidden mixtape, recovers from a 409 revision conflict', async ({ page, context }) => {
    const id = await signInAs(context, 'a4');
    await page.goto(`/mixtapes/${id('creasy-v1')}`);
    await page.locator('[data-owner-callout]').getByRole('button', { name: 'Edit' }).click();

    const editor = openDialog(page, 'Editing · Creasy Drops');
    await expect(editor.getByRole('heading', { name: 'Editing · Creasy Drops' })).toBeVisible();
    const save = editor.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeDisabled();
    await expect(editor.locator('[data-mixtape-coaching]')).toContainText('Hidden from the Mixtapes page');

    // Add a song "Creasy Drops" (v2) doesn't have → will be listed.
    await editor.getByRole('button', { name: 'Add songs' }).click();
    const picker = openDialog(page, 'Add songs');
    await expect(picker.getByRole('heading', { name: 'Add songs' })).toBeVisible();
    await expect(picker.getByText('1 song in "Creasy Drops"')).toBeVisible();
    await picker.getByRole('button', { name: 'Add Starlight Mint Anthem to mixtape' }).click();
    await picker.getByRole('button', { name: 'Done' }).click();
    await expect(editor.locator('[data-mixtape-coaching]')).toContainText('Will be listed after you save');
    await expect(editor.getByText('New', { exact: true })).toBeVisible();
    await expect(save).toBeEnabled();

    // B-26: an empty description is fine in edit mode too.
    await expect(editor.getByLabel(/Description/)).toHaveValue('Late-night drops.');
    await editor.getByLabel(/Description/).fill('');
    await capture(page, 'builder-edit-relist-390.png');

    // Mini-bar label while editing (sheet closed).
    await editor.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: /^Continue editing Creasy Drops \(2\)$/ })).toContainText('Editing "Creasy Drops"');
    await page.getByRole('button', { name: /^Continue editing Creasy Drops/ }).click();

    // 409 once → inline recovery with both choices (+ a toast offering Load latest).
    let conflicted = false;
    await page.route(`${api}/mixtapes/${id('creasy-v1')}`, async (route) => {
      if (route.request().method() !== 'PUT' || conflicted) return route.continue();
      conflicted = true;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4328', 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({
          error: 'This mixtape was changed somewhere else.',
          code: 'revision_conflict',
          current: { Id: id('creasy-v1'), Title: 'Creasy Drops', Desc: 'Late-night drops.', Address: 'CMIXOWNERA4', Created_At: '2026-11-20 10:00:00', Smols: ['first-smol'], Visibility: 'owner', Revision: 1 },
        }),
      });
    });
    await save.click();
    const conflict = editor.getByRole('alert').filter({ hasText: 'was changed on another device' });
    await expect(conflict.getByRole('button', { name: 'Load latest' })).toBeVisible();
    await expect(conflict.getByRole('button', { name: 'Save mine anyway' })).toBeVisible();
    await expect(page.locator('.toast-stack').getByRole('button', { name: 'Load latest' })).toBeVisible();

    const put = page.waitForRequest((req) => req.method() === 'PUT' && req.url().endsWith(`/mixtapes/${id('creasy-v1')}`));
    await conflict.getByRole('button', { name: 'Save mine anyway' }).click();
    const body = (await put).postDataJSON();
    expect(body).toMatchObject({ title: 'Creasy Drops', desc: '', smols: ['first-smol', 'smol-minted'], expectedRevision: 1 });

    await expect(toasts(page).filter({ hasText: 'Saved. "Creasy Drops" is back on the Mixtapes page.' })).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('[data-owner-status="listed"]')).toHaveText('Listed');
    await expect(page.locator('[data-owner-callout]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('smol:mixtape-edit:CMIXOWNERA4'))).toBeNull();
  });

  test('merge sheet: previews counts, reassures, blocks >100, handles 409 unavailable tracks, then merges', async ({ page, context }) => {
    const id = await signInAs(context, 'a5');
    await page.goto(`/mixtapes/${id('night-drive')}`);
    await page.getByRole('button', { name: 'More actions for Night Drive' }).click();
    await page.getByRole('menuitem', { name: 'Merge into another mixtape' }).click();

    const sheet = openDialog(page, 'Merge');
    await expect(sheet.getByText('Only the playlist changes. Your songs and any owned tokens aren’t touched.')).toBeVisible();
    const submit = sheet.getByRole('button', { name: 'Merge & delete copy' });
    await expect(submit).toBeDisabled();

    await sheet.getByRole('radio', { name: /Everything Bagel/ }).check();
    await expect(sheet.locator('[data-merge-total]')).toHaveText('99 → 102 songs');
    await expect(sheet.getByRole('alert')).toContainText('"Everything Bagel" can hold 100 songs. 2 songs won’t fit');
    await expect(submit).toBeDisabled();
    await capture(page, 'merge-guard-390.png');

    await sheet.getByRole('radio', { name: /One Song Wonder/ }).check();
    await expect(sheet.locator('[data-merge-total]')).toHaveText('1 → 4 songs');
    await expect(sheet.locator('[data-merge-outcome]')).toHaveText(
      '3 songs will be added to the end of "One Song Wonder". Then "Night Drive" is removed and its link opens "One Song Wonder".'
    );
    await expect(submit).toBeEnabled();

    // 409 merge_unavailable_tracks is explained inline; nothing navigates.
    let rejected = false;
    await page.route(`${api}/mixtapes/${id('night-drive')}/merge`, async (route) => {
      if (rejected) return route.continue();
      rejected = true;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4328', 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ error: 'x', code: 'merge_unavailable_tracks', unavailableCount: 2 }),
      });
    });
    await submit.click();
    await expect(sheet.getByRole('alert')).toContainText('2 songs in this mixtape aren’t public right now, so merging would lose them.');
    await expect(page).toHaveURL(new RegExp(`/mixtapes/${id('night-drive')}$`));

    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/mixtapes/${id('solo')}$`));
    const merged = toasts(page).filter({ hasText: 'Merged into "One Song Wonder". 3 songs added.' });
    await expect(merged).toBeVisible();
    // 25d pass 2 P2-5: the success toast carries a focusable next step and takes focus.
    await expect(merged.getByRole('button', { name: 'Your mixtapes' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'One Song Wonder', level: 1 })).toBeVisible();
    // The solo mixtape now has 4 songs, so it is listed again.
    await expect(page.locator('[data-owner-status="listed"]')).toBeVisible();
  });

  test('delete: reassuring confirm → /mixtapes?view=yours → 10s Undo restores it', async ({ page, context }) => {
    const id = await signInAs(context, 'a6');
    await page.goto(`/mixtapes/${id('solo')}`);
    const callout = page.locator('[data-owner-callout]');
    await expect(callout.locator('[data-owner-callout-why]')).toHaveText(
      'Mixtapes need at least 2 songs to show on the Mixtapes page. This one has 1 song.'
    );
    await expect(callout.locator('[data-owner-callout-advice]')).toHaveText(
      'Add 1 more song to show on the Mixtapes page. You can still share it as a link.'
    );
    await expect(callout.getByRole('button', { name: 'Add songs' })).toBeVisible();
    await callout.getByRole('button', { name: 'Delete mixtape' }).click();

    const confirm = openDialog(page, 'Delete "One Song Wonder"?');
    await expect(confirm.getByRole('heading', { name: 'Delete "One Song Wonder"?' })).toBeVisible();
    await expect(confirm).toContainText('Deletes this playlist only — none of your songs or anyone’s owned tokens are affected.');
    await capture(page, 'delete-confirm-390.png');
    await confirm.getByRole('button', { name: 'Delete mixtape' }).click();

    await expect(page).toHaveURL(/\/mixtapes\?view=yours$/);
    const toast = toasts(page).filter({ hasText: 'Deleted "One Song Wonder".' });
    const undo = toast.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();
    // 25d P2-7: focus moves to Undo, and every toast target is >= 44px.
    await expect(undo).toBeFocused();
    const box = await undo.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    const dismissBox = await toast.getByRole('button', { name: 'Dismiss notification' }).boundingBox();
    expect(Math.min(dismissBox!.height, dismissBox!.width)).toBeGreaterThanOrEqual(44);
    await expect(page.locator(`[data-mixtape-card="${id('solo')}"]`)).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect(toasts(page).filter({ hasText: 'Restored "One Song Wonder".' })).toBeVisible();
    await expect(page.locator(`[data-mixtape-card="${id('solo')}"]`)).toBeVisible();
    // ...and lands on the restored card.
    await expect(page.locator(`[data-mixtape-card="${id('solo')}"] a`)).toBeFocused();
    const res = await page.request.get(`${api}/mixtapes/${id('solo')}`);
    expect(res.status()).toBe(200);
  });

  test('B-26: publishing with an empty description sends desc ""; a 1-song draft gets non-punitive coaching', async ({ page, context }) => {
    await signInAs(context, 'a7');
    await seedDraft(page, {
      title: 'Fresh Mix',
      description: '',
      tracks: [
        { id: 'smol-minted', title: 'Starlight Mint Anthem' },
        { id: 'smol-2take', title: 'Neon Arcade Runner' },
      ],
    });
    await page.getByRole('button', { name: 'Open mixtape draft (2)' }).click();
    const builder = openDialog(page, 'Fresh Mix');
    await expect(builder.getByLabel(/Description/)).toHaveValue('');

    // Down to 1 song → too_few coaching, still publishable as a link.
    const strip = builder.locator('[data-mixtape-coaching]');
    await expect(strip).toBeEmpty();
    await builder.getByRole('button', { name: 'Remove track' }).nth(1).click();
    await expect(strip).toContainText('Add 1 more song to show on the Mixtapes page. You can still publish it as a link.');
    await expect(builder.getByRole('button', { name: 'Publish mixtape (1)' })).toBeEnabled();
    await toasts(page).filter({ hasText: 'Removed' }).getByRole('button', { name: 'Undo' }).click();
    await expect(strip).toBeEmpty();

    const post = page.waitForRequest((req) => req.method() === 'POST' && req.url() === `${api}/mixtapes`);
    await builder.getByRole('button', { name: 'Publish mixtape (2)' }).click();
    expect((await post).postDataJSON()).toEqual({ title: 'Fresh Mix', desc: '', smols: ['smol-minted', 'smol-2take'] });
    await expect(page).toHaveURL('/mixtapes/fixture-mixtape');
  });
});

test.describe('Mixtape owner renders (1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('desktop: Yours directory, hidden callout, builder coaching, merge sheet', async ({ page, context }) => {
    const id = await signInAs(context, 'd1');

    await page.goto('/mixtapes?view=yours');
    await expect(page.getByRole('heading', { name: /Hidden from the Mixtapes page/ })).toBeVisible();
    await capture(page, 'yours-1440.png');

    await page.goto(`/mixtapes/${id('creasy-v1')}`);
    await expect(page.locator('[data-owner-callout]')).toBeVisible();
    await capture(page, 'detail-hidden-owner-1440.png');

    await page.goto(`/mixtapes/${id('creasy-v2')}`);
    await page.getByRole('button', { name: 'More actions for Creasy Drops' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await capture(page, 'detail-listed-menu-1440.png');
    await page.getByRole('menuitem', { name: 'Merge into another mixtape' }).click();
    const sheet = openDialog(page, 'Merge');
    await sheet.getByRole('radio', { name: /Night Drive/ }).check();
    await expect(sheet.locator('[data-merge-outcome]')).toBeVisible();
    await capture(page, 'merge-sheet-1440.png');
    await sheet.getByRole('button', { name: 'Cancel' }).click();

    await seedDraft(page, {
      title: 'Creasy again',
      tracks: [
        { id: 'first-smol', title: 'First Track' },
        { id: 'second-smol', title: 'Second Track' },
      ],
    });
    await page.getByRole('button', { name: /Mixtape draft/ }).click();
    const builder = panel(page);
    await expect(builder.locator('[data-mixtape-coaching]')).toContainText('Heads up: this matches your mixtape "Creasy Drops".');
    await capture(page, 'builder-coaching-1440.png');
    await builder.getByRole('button', { name: 'Edit "Creasy Drops" instead' }).click();
    await expect(builder.getByRole('heading', { name: 'Editing · Creasy Drops' })).toBeVisible();
    await capture(page, 'builder-edit-1440.png');
  });
});

// ---------------------------------------------------------------------------
// 25d review regressions (4 × P1, 8 × P2)
// ---------------------------------------------------------------------------

test.describe('25d regressions (390×844)', () => {
  test('P1-1: saving an owned, on-chain-but-unindexed song refreshes collector ownership without reload', async ({ page, context }) => {
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt(CHAIN_OWNER), url: 'http://127.0.0.1:4328' }]);
    const OWNED = 10_000_000n * 10_000_000n;
    let delayMs = 0;
    const stats = await installStellarMock(page, () => ({
      minted: [CHAIN_TRACK_INDEXED.Id, CHAIN_TRACK_UNINDEXED.Id],
      balances: { [CHAIN_TRACK_UNINDEXED.Id]: OWNED },
      kale: 1_000n * 10_000_000n,
      delayMs,
    }));
    const collectCard = page.locator('section[aria-labelledby="collect-title"]');

    await page.goto('/mixtapes/mx-chain-set');
    await expect(collectCard.getByRole('heading')).toHaveText(/You don.t own any of these yet/, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openDialog(page).getByRole('button', { name: 'Close' }).click();

    // Add the owned song from its own page into the open edit, then come back.
    await page.goto(`/${CHAIN_TRACK_UNINDEXED.Id}`);
    await page.getByRole('button', { name: 'Add to mixtape' }).click();
    await expect(toasts(page).filter({ hasText: 'to "Chain Set"' })).toBeVisible();
    await page.goto('/mixtapes/mx-chain-set');
    await expect(collectCard.getByRole('heading')).toHaveText(/You don.t own any of these yet/, { timeout: 15_000 });
    const readsBefore = stats.getLedgerEntries;

    await page.getByRole('button', { name: /^Continue editing Chain Set \(2\)$/ }).click();
    // 25d pass 2 P1-6: hold the NEW ownership read; the stale costed CTA must never be offered meanwhile.
    delayMs = 3_000;
    await openDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(toasts(page).filter({ hasText: 'Saved. "Chain Set" is back on the Mixtapes page.' })).toBeVisible();
    await expect(page.getByText('2 songs').first()).toBeVisible();
    const refreshing = page.locator('[data-collect-refreshing]');
    await expect(refreshing).toBeVisible();
    await expect(refreshing).toContainText('Refreshing holdings…');
    await expect(page.getByRole('button', { name: /Mint|Buy|Collect for|Complete/ })).toHaveCount(0);
    await expect(collectCard).toHaveCount(0);
    // Fresh ownership read for the new track set: the owned song counts immediately.
    await expect(collectCard.getByRole('heading')).toHaveText(/You own 1 of 2/, { timeout: 15_000 });
    expect(stats.getLedgerEntries).toBeGreaterThan(readsBefore);
  });

  test('P1-2: account B never sees, opens or deletes account A’s unsaved edit', async ({ page, context }) => {
    const idA = await signInAs(context, 'b1');
    await page.goto(`/mixtapes/${idA('night-drive')}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = openDialog(page);
    await editor.getByLabel('Title').fill('A secret title');
    await editor.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: /^Continue editing A secret title/ })).toBeVisible();

    // Same browser profile, switch to account B.
    await signInAs(context, 'b2');
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Continue editing/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'You and library' }).click();
    const sheet = openDialog(page, 'Your library');
    await expect(sheet.getByRole('button', { name: /Editing/ })).toHaveCount(0);
    await sheet.getByRole('button', { name: /New mixtape|Open mixtape draft/ }).click();
    const builder = openDialog(page);
    await expect(builder.getByRole('heading', { name: 'New mixtape' })).toBeVisible();
    await expect(builder.getByText('A secret title')).toHaveCount(0);
    await expect(builder.getByRole('button', { name: 'Delete mixtape' })).toHaveCount(0);
    await builder.getByRole('button', { name: 'Close' }).click();
    // A's slot is isolated, not destroyed.
    expect(await page.evaluate(() => localStorage.getItem('smol:mixtape-edit:CMIXOWNERB1') ?? '')).toContain('A secret title');

    // Back to A: the unsaved edit is still there.
    await signInAs(context, 'b1');
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Continue editing A secret title/ })).toBeVisible();
  });

  test('P1-4: a Create-slot Undo can never mutate the Edit slot', async ({ page, context }) => {
    await signInAs(context, 'd2');
    await seedDraft(page, {
      title: 'Creasy again',
      tracks: [
        { id: 'first-smol', title: 'First Track' },
        { id: 'second-smol', title: 'Second Track' },
      ],
    });
    await page.getByRole('button', { name: 'Open mixtape draft (2)' }).click();
    const builder = openDialog(page);
    await builder.getByRole('button', { name: 'Remove track' }).nth(1).click();
    const undoToast = toasts(page).filter({ hasText: 'Removed "Second Track" from draft.' });
    await expect(undoToast.getByRole('button', { name: 'Undo' })).toBeVisible();

    await builder.getByRole('button', { name: 'Edit "Creasy Drops" instead' }).click();
    await expect(builder.getByRole('heading', { name: 'Editing · Creasy Drops' })).toBeVisible();
    // The draft's Undo is gone with the slot switch; the edit slot is exactly the published mixtape.
    await expect(undoToast).toHaveCount(0);
    await expect(builder.getByText('3 songs selected')).toBeVisible();
    await expect(builder.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    const slots = await page.evaluate(() => ({
      draft: JSON.parse(localStorage.getItem('smol:mixtape-draft') || '{}').tracks?.map((t: { id: string }) => t.id),
      edit: (JSON.parse(localStorage.getItem('smol:mixtape-edit:CMIXOWNERD2') || '{}') as { tracks?: { id: string }[] }).tracks?.map((t) => t.id),
    }));
    expect(slots).toEqual({ draft: ['first-smol'], edit: ['first-smol', 'second-smol', 'third-smol'] });
  });

  test('P2-2: 409 concurrent_delete closes the edit (no Load latest), and the toast Load latest clears the banner', async ({ page, context }) => {
    const id = await signInAs(context, 'e1');
    const url = `${api}/mixtapes/${id('night-drive')}`;
    await page.goto(`/mixtapes/${id('night-drive')}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    let editor = openDialog(page);
    await editor.getByLabel('Title').fill('Doomed edit');
    let mode: 'deleted' | 'conflict' | 'pass' = 'deleted';
    await page.route(url, async (route) => {
      if (route.request().method() !== 'PUT' || mode === 'pass') return route.continue();
      const body =
        mode === 'deleted'
          ? { error: 'Mixtape was deleted concurrently after update', code: 'concurrent_delete', id: id('night-drive') }
          : {
              error: 'changed',
              code: 'revision_conflict',
              current: { Id: id('night-drive'), Title: 'Night Drive', Desc: 'Synthwave for the highway.', Address: 'CMIXOWNERE1', Created_At: '2026-11-18 09:00:00', Smols: ['smol-2take', 'smol-1take', 'smol-fallback'], Visibility: 'public', Revision: 1 },
            };
      mode = 'pass';
      await route.fulfill({ status: 409, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    });
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await expect(toasts(page).filter({ hasText: 'deleted on another device' })).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Load latest' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save mine anyway' })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('smol:mixtape-edit:CMIXOWNERE1'))).toBeNull();

    // A real conflict: the TOAST "Load latest" also clears the inline banner.
    mode = 'conflict';
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    editor = openDialog(page);
    await editor.getByLabel('Title').fill('Mine');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await expect(editor.locator('[data-mixtape-conflict]')).toBeVisible();
    await page.locator('.toast-stack').getByRole('button', { name: 'Load latest' }).click();
    await expect(editor.locator('[data-mixtape-conflict]')).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Save mine anyway' })).toHaveCount(0);
    await expect(editor.getByLabel('Title')).toHaveValue('Night Drive');
    await expect(editor.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  test('P2-3: merge with targetDeletedConcurrently lands on Yours with no dead Open link', async ({ page, context }) => {
    const id = await signInAs(context, 'f1');
    await page.goto(`/mixtapes/${id('night-drive')}`);
    await page.getByRole('button', { name: 'More actions for Night Drive' }).click();
    await page.getByRole('menuitem', { name: 'Merge into another mixtape' }).click();
    const sheet = openDialog(page, 'Merge');
    await sheet.getByRole('radio', { name: /One Song Wonder/ }).check();
    await page.route(`${api}/mixtapes/${id('night-drive')}/merge`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({ targetId: id('solo'), mergedId: id('night-drive'), addedCount: 3, totalTracks: 4, target: null, targetDeletedConcurrently: true }),
      })
    );
    await sheet.getByRole('button', { name: 'Merge & delete copy' }).click();
    await expect(page).toHaveURL(/\/mixtapes\?view=yours$/);
    const toast = toasts(page).filter({ hasText: '"One Song Wonder" was deleted at the same moment' });
    await expect(toast).toBeVisible();
    await expect(toast.getByRole('button', { name: 'Open' })).toHaveCount(0);
  });

  test('P2-4: a rejected merge freezes the stale preview; "Review in editor first" merges through the editor', async ({ page, context }) => {
    const id = await signInAs(context, 'g1');
    await page.goto(`/mixtapes/${id('night-drive')}`);
    await page.getByRole('button', { name: 'More actions for Night Drive' }).click();
    await page.getByRole('menuitem', { name: 'Merge into another mixtape' }).click();
    const sheet = openDialog(page, 'Merge');
    await sheet.getByRole('radio', { name: /One Song Wonder/ }).check();
    const submit = sheet.getByRole('button', { name: 'Merge & delete copy' });
    await expect(submit).toBeEnabled();
    await page.route(`${api}/mixtapes/${id('night-drive')}/merge`, (route) =>
      route.fulfill({ status: 400, contentType: 'text/plain', headers: cors, body: 'Merged mixtape would have 101 songs (max 100)' })
    );
    await submit.click();
    await expect(sheet.getByRole('alert')).toContainText('Mixtapes can hold up to 100 songs.');
    await expect(sheet.locator('[data-merge-needs-review]')).toBeVisible();
    await expect(submit).toBeDisabled();
    await page.waitForTimeout(500);
    await expect(submit).toBeDisabled();

    await sheet.getByRole('button', { name: 'Review in editor first' }).click();
    const editor = openDialog(page, 'Editing · One Song Wonder');
    await expect(editor.getByText('Merging "Night Drive" into this mixtape')).toBeVisible();
    await expect(editor.getByText('4 songs selected')).toBeVisible();
    await editor.getByRole('button', { name: 'Save & delete copy' }).click();
    await expect(toasts(page).filter({ hasText: 'Saved "One Song Wonder" and deleted the copy "Night Drive".' })).toBeVisible();
    const rows = await ownerSnapshot(page, 'g1');
    expect(rows.find((r) => r.Id === id('solo'))!.Smols).toEqual(['cjk-smol', 'smol-2take', 'smol-1take', 'smol-fallback']);
    expect(rows.find((r) => r.Id === id('night-drive'))!.Deleted_At).not.toBeNull();
  });

  test('P2-5: a sibling edit updates this detail page live (listed → hidden)', async ({ page, context }) => {
    const id = await signInAs(context, 'h1');
    // Start editing the hidden 1-song copy: make it a superset of "Creasy Drops" (v2).
    await page.goto(`/mixtapes/${id('creasy-v1')}`);
    await page.locator('[data-owner-callout]').getByRole('button', { name: 'Edit' }).click();
    const editor = openDialog(page);
    await editor.getByRole('button', { name: 'Add songs' }).click();
    for (const name of ['Second Track', 'Third Track', 'Starlight Mint Anthem']) {
      await openDialog(page).getByRole('button', { name: `Add ${name} to mixtape` }).click();
    }
    await openDialog(page).getByRole('button', { name: 'Done' }).click();
    await openDialog(page).getByRole('button', { name: 'Close' }).click();

    // On the SIBLING (v2, listed) save the v1 edit: v2 becomes hidden without a reload.
    await page.goto(`/mixtapes/${id('creasy-v2')}`);
    await expect(page.locator('[data-owner-status="listed"]')).toBeVisible();
    await page.getByRole('button', { name: /^Continue editing Creasy Drops \(4\)$/ }).click();
    await openDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('[data-owner-status="hidden"]')).toBeVisible();
    await expect(page.locator('[data-owner-callout]')).toContainText('Every song here is also in your bigger mixtape');
  });

  test('P2-6: authenticated SSR renders Yours cards and the owner callout, with no hydration warnings', async ({ page, context, request }) => {
    const id = await signInAs(context, 'i1');
    const yours = await (await page.request.get('/mixtapes?view=yours')).text();
    expect(yours).toContain(`data-mixtape-card="${id('creasy-v1')}"`);
    expect(yours).toContain('Hidden from the Mixtapes page');
    expect(yours).toContain('Already in &quot;Creasy Drops&quot;');
    const detail = await (await page.request.get(`/mixtapes/${id('creasy-v1')}`)).text();
    expect(detail).toContain('data-ssr-owner-callout');
    expect(detail).toContain('so that one is shown on the Mixtapes page instead');

    // Non-owner SSR: never the callout.
    const anon = await request.get(`/mixtapes/${id('creasy-v1')}`);
    expect(await anon.text()).not.toContain('data-ssr-owner-callout');

    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (/hydrat/i.test(msg.text())) warnings.push(msg.text());
    });
    await page.goto('/mixtapes?view=yours');
    await expect(page.locator(`[data-mixtape-card="${id('creasy-v1')}"]`)).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Listed/ })).toBeVisible();
    await page.goto(`/mixtapes/${id('creasy-v1')}`);
    await expect(page.locator('section[data-owner-callout]')).toHaveCount(1);
    await expect(page.locator('[data-ssr-owner-callout]')).toHaveCount(0);
    expect(warnings).toEqual([]);
  });

  test('P2-1: 503 create_pending offers a timed retry; 409 create_conflict offers to review the changed row', async ({ page, context }) => {
    const id = await signInAs(context, 'l1');
    await seedDraft(page, {
      title: 'Pending Mix',
      tracks: [
        { id: 'smol-minted', title: 'Starlight Mint Anthem' },
        { id: 'smol-2take', title: 'Neon Arcade Runner' },
      ],
    });
    let calls = 0;
    await page.route(`${api}/mixtapes`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      calls += 1;
      if (calls === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { ...cors, 'Retry-After': '1' },
          body: JSON.stringify({ error: 'Mixtape creation is still finishing; please retry', code: 'create_pending' }),
        });
      } else {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({ error: 'changed', code: 'create_conflict', id: id('night-drive') }),
        });
      }
    });
    await page.getByRole('button', { name: 'Open mixtape draft (2)' }).click();
    const builder = openDialog(page);
    await builder.getByRole('button', { name: 'Publish mixtape (2)' }).click();
    await expect(builder.getByRole('status').filter({ hasText: 'still finishing your last publish' })).toBeVisible();
    const retry = builder.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeDisabled();
    // 25d pass 2 P2-1: the main Publish button can't bypass the Retry-After wait either.
    await expect(builder.getByRole('button', { name: 'Publish mixtape (2)' })).toBeDisabled();
    expect(calls).toBe(1);
    await expect(retry).toBeEnabled({ timeout: 3_000 });
    await expect(builder.getByRole('button', { name: 'Publish mixtape (2)' })).toBeEnabled();
    await retry.click();
    await expect(builder.getByRole('alert')).toContainText('changed while it was being published');
    await builder.getByRole('button', { name: 'Review it' }).click();
    await expect(page).toHaveURL(new RegExp(`/mixtapes/${id('night-drive')}$`));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('smol:mixtape-draft') || '{}').tracks?.length)).toBe(2);
  });
});

test.describe('25d regressions (1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('P2-8: the desktop builder is a non-modal docked panel; the page stays usable', async ({ page, context }) => {
    await signInAs(context, 'k1');
    await page.goto('/');
    await page.getByRole('button', { name: 'New mixtape' }).click();
    const builder = panel(page);
    await expect(builder.getByRole('heading', { name: 'New mixtape' })).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    // Browse + add from the page while the panel stays open.
    await page.locator('main').getByRole('button', { name: 'Add First Track to mixtape' }).click();
    await expect(builder.getByText('1 song selected')).toBeVisible();
    const mainBox = await page.locator('main').boundingBox();
    const panelBox = await builder.boundingBox();
    expect(mainBox!.x + mainBox!.width).toBeLessThanOrEqual(panelBox!.x + 1);
    await capture(page, 'builder-panel-1440.png');
    await builder.getByRole('button', { name: 'Close' }).click();
    await expect(builder).toHaveCount(0);
  });

  test('P1-3: every edit mutation is frozen while the PUT is in flight; nothing typed is lost', async ({ page, context }) => {
    const id = await signInAs(context, 'c1');
    await page.goto(`/mixtapes/${id('night-drive')}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const builder = panel(page);
    const title = builder.getByLabel('Title');
    await title.fill('First title');

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`${api}/mixtapes/${id('night-drive')}`, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      await held;
      await route.continue();
    });
    await builder.getByRole('button', { name: 'Save changes' }).click();
    await expect(builder.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(builder.locator('[data-mixtape-builder-body]')).toHaveAttribute('inert', '');
    // Even a forced (programmatic) edit is refused by the store while saving.
    await title.evaluate((el: HTMLInputElement) => {
      el.value = 'Second title';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await builder.getByRole('button', { name: 'Remove track' }).first().evaluate((el: HTMLButtonElement) => el.click());
    release();

    await expect(toasts(page).filter({ hasText: 'Saved "First title".' })).toBeVisible();
    await expect(builder).toHaveCount(0);
    const saved = (await ownerSnapshot(page, 'c1')).find((r) => r.Id === id('night-drive'))!;
    expect(saved.Title).toBe('First title');
    expect(saved.Smols).toHaveLength(3);
    expect(await page.evaluate(() => localStorage.getItem('smol:mixtape-edit:CMIXOWNERC1'))).toBeNull();
  });

  test('P2-5: an edit saved on All refreshes the All card without a reload', async ({ page, context }) => {
    await signInAs(context, 'demo');
    const newTitle = `Night Drive ${Date.now().toString(36)}`;
    await page.goto('/mixtapes/mx-demo-night-drive');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await panel(page).getByLabel('Title').fill(newTitle);
    await panel(page).getByRole('button', { name: 'Close' }).click();

    await page.goto('/mixtapes');
    const card = page.locator('[data-mixtape-card="mx-demo-night-drive"]');
    await expect(card).toBeVisible();
    await expect(card).not.toContainText(newTitle);
    await page.getByRole('button', { name: 'Editing mixtape' }).click();
    await panel(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(card).toContainText(newTitle);
  });
});

// ---------------------------------------------------------------------------
// 25d pass 2 regressions (6 × P1, 5 × P2)
// ---------------------------------------------------------------------------

async function openReviewInEditor(page: Page, id: (slug: string) => string) {
  await page.goto(`/mixtapes/${id('night-drive')}`);
  await page.getByRole('button', { name: 'More actions for Night Drive' }).click();
  await page.getByRole('menuitem', { name: 'Merge into another mixtape' }).click();
  const sheet = openDialog(page, 'Merge');
  await sheet.getByRole('radio', { name: /One Song Wonder/ }).check();
  await sheet.getByRole('button', { name: 'Review in editor first' }).click();
  const editor = openDialog(page, 'Editing · One Song Wonder');
  await expect(editor.getByText('4 songs selected')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Save & delete copy' })).toBeEnabled();
  return editor;
}

test.describe('25d pass 2 regressions (390×844)', () => {
  test('P1-1: Load latest after a 409 cancels the reviewed merge; the source can never be deleted', async ({ page, context }) => {
    const id = await signInAs(context, 'g2');
    const editor = await openReviewInEditor(page, id);
    // Another device renames the TARGET, so the reviewed save conflicts.
    await remoteEdit(page, 'g2', id('solo'), () => ({ title: 'One Song Wonder (remote)' }));
    await editor.getByRole('button', { name: 'Save & delete copy' }).click();
    const banner = editor.locator('[data-mixtape-conflict]');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Load latest' }).click();

    await expect(toasts(page).filter({ hasText: 'The merge with "Night Drive" was cancelled' })).toBeVisible();
    await expect(editor.getByText('1 song selected')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Save & delete copy' })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect((await page.request.get(`${api}/mixtapes/${id('night-drive')}`)).status()).toBe(200);
  });

  test('P1-2: a newer source revision is never deleted; its new songs are brought in for review', async ({ page, context }) => {
    const id = await signInAs(context, 'g3');
    const editor = await openReviewInEditor(page, id);
    // Another device adds a 4th song to the SOURCE after the review started.
    await remoteEdit(page, 'g3', id('night-drive'), (row) => ({ smols: [...row.Smols, 'first-smol'] }));

    await editor.getByRole('button', { name: 'Save & delete copy' }).click();
    await expect(editor.getByText('"Night Drive" changed on another device, so it wasn’t deleted.')).toBeVisible();
    await expect(editor.getByText('5 songs selected')).toBeVisible();
    let rows = await ownerSnapshot(page, 'g3');
    expect(rows.find((r) => r.Id === id('night-drive'))!.Deleted_At).toBeNull();
    expect(rows.find((r) => r.Id === id('solo'))!.Smols).toEqual(['cjk-smol']); // nothing saved yet

    // Reviewed again (now including the new song): the delete is safe.
    await editor.getByRole('button', { name: 'Save & delete copy' }).click();
    await expect(toasts(page).filter({ hasText: 'Saved "One Song Wonder" and deleted the copy "Night Drive".' })).toBeVisible();
    rows = await ownerSnapshot(page, 'g3');
    expect(rows.find((r) => r.Id === id('solo'))!.Smols).toEqual(['cjk-smol', 'smol-2take', 'smol-1take', 'smol-fallback', 'first-smol']);
    expect(rows.find((r) => r.Id === id('night-drive'))!.Deleted_At).not.toBeNull();
  });

  test('P1-3: a 503 on Load latest keeps the dirty edit and the conflict choices', async ({ page, context }) => {
    const id = await signInAs(context, 'e2');
    const url = `${api}/mixtapes/${id('night-drive')}`;
    let mode: 'conflict' | 'unavailable' | 'pass' = 'pass';
    await page.route(url, async (route) => {
      const method = route.request().method();
      if (mode === 'conflict' && method === 'PUT') {
        mode = 'unavailable';
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({
            error: 'changed',
            code: 'revision_conflict',
            current: { Id: id('night-drive'), Title: 'Night Drive', Desc: '', Address: 'CMIXOWNERE2', Created_At: '2026-11-18 09:00:00', Smols: ['smol-2take'], Visibility: 'public', Revision: 2 },
          }),
        });
      }
      if (mode === 'unavailable' && method === 'GET') {
        return route.fulfill({ status: 503, contentType: 'text/plain', headers: cors, body: 'upstream unavailable' });
      }
      return route.continue();
    });
    await page.goto(`/mixtapes/${id('night-drive')}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = openDialog(page);
    await editor.getByLabel('Title').fill('Mine');
    mode = 'conflict';
    await editor.getByRole('button', { name: 'Save changes' }).click();
    const banner = editor.locator('[data-mixtape-conflict]');
    await banner.getByRole('button', { name: 'Load latest' }).click();

    await expect(toasts(page).filter({ hasText: 'Couldn’t load the latest version. Your changes are still here' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Load latest' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Save mine anyway' })).toBeVisible();
    await expect(editor.getByLabel('Title')).toHaveValue('Mine');
    expect(await page.evaluate(() => localStorage.getItem('smol:mixtape-edit:CMIXOWNERE2') ?? '')).toContain('"title":"Mine"');
  });

  test('P1-4: two tabs on two accounts keep BOTH parked edits (independent per-owner keys)', async ({ page, context }) => {
    const idA = await signInAs(context, 'b3');
    await page.goto(`/mixtapes/${idA('night-drive')}`);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    const idB = await signInAs(context, 'b4');
    const tabB = await context.newPage();
    await tabB.goto(`/mixtapes/${idB('night-drive')}`);
    await expect(tabB.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

    // Both tabs were open before either edited.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openDialog(page).getByLabel('Title').fill('A title');
    await openDialog(page).getByRole('button', { name: 'Close' }).click();
    await tabB.getByRole('button', { name: 'Edit', exact: true }).click();
    await openDialog(tabB).getByLabel('Title').fill('B title');
    await openDialog(tabB).getByRole('button', { name: 'Close' }).click();
    // ...and A edits again after B.
    await page.getByRole('button', { name: /^Continue editing A title/ }).click();
    await openDialog(page).getByLabel('Description (optional)').fill('A again');
    await openDialog(page).getByRole('button', { name: 'Close' }).click();

    const stored = await page.evaluate(() => ({
      a: localStorage.getItem('smol:mixtape-edit:CMIXOWNERB3') ?? '',
      b: localStorage.getItem('smol:mixtape-edit:CMIXOWNERB4') ?? '',
      shared: localStorage.getItem('smol:mixtape-edit'),
    }));
    expect(stored.a).toContain('"title":"A title"');
    expect(stored.a).toContain('A again');
    expect(stored.b).toContain('"title":"B title"');
    expect(stored.shared).toBeNull();
    await tabB.close();
  });

  test('P2-2: a rejected merge re-derives BOTH rows from the refreshed list (1 → 5, not 1 → 4)', async ({ page, context }) => {
    const id = await signInAs(context, 'g4');
    await page.goto(`/mixtapes/${id('night-drive')}`);
    await page.getByRole('button', { name: 'More actions for Night Drive' }).click();
    await page.getByRole('menuitem', { name: 'Merge into another mixtape' }).click();
    const sheet = openDialog(page, 'Merge');
    await sheet.getByRole('radio', { name: /One Song Wonder/ }).check();
    await expect(sheet.locator('[data-merge-total]')).toHaveText('1 → 4 songs');

    await remoteEdit(page, 'g4', id('night-drive'), (row) => ({ smols: [...row.Smols, 'first-smol'] }));
    await page.route(`${api}/mixtapes/${id('night-drive')}/merge`, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({
          error: 'changed',
          code: 'revision_conflict',
          current: { Id: id('solo'), Title: 'One Song Wonder', Desc: '', Address: 'CMIXOWNERG4', Created_At: '2026-11-19 12:00:00', Smols: ['cjk-smol'], Visibility: 'owner', Revision: 1 },
        }),
      })
    );
    await sheet.getByRole('button', { name: 'Merge & delete copy' }).click();
    await expect(sheet.getByRole('alert')).toContainText('changed on another device');
    await expect(sheet.locator('[data-merge-total]')).toHaveText('1 → 5 songs');
    await expect(sheet.locator('[data-merge-outcome]')).toContainText('4 songs will be added');
  });

  test('P2-4: the SSR owner callout needs a VERIFIED session (/mixtapes/mine), not just a matching cookie subject', async ({ page, context }) => {
    const id = (slug: string) => `mx-i2-${slug}`;
    // Expired session whose payload still names the creator.
    await context.addCookies([{ name: 'smol_token', value: fakeSmolJwt('CMIXOWNERI2', { exp: 1 }), url: 'http://127.0.0.1:4328' }]);
    const expired = await (await page.request.get(`/mixtapes/${id('creasy-v1')}`)).text();
    expect(expired).toContain('Creasy Drops');
    expect(expired).not.toContain('data-ssr-owner-callout');

    await signInAs(context, 'i2');
    const verified = await (await page.request.get(`/mixtapes/${id('creasy-v1')}`)).text();
    expect(verified).toContain('data-ssr-owner-callout');
  });
});

test.describe('25d pass 2 regressions (1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('P1-5: create is frozen while its POST is in flight; a page add is refused, not silently dropped', async ({ page, context }) => {
    await signInAs(context, 'p1');
    await seedDraft(page, { title: 'Held Mix', tracks: [{ id: 'smol-minted', title: 'Starlight Mint Anthem' }] });
    await page.getByRole('button', { name: /Mixtape draft/ }).click();
    const builder = panel(page);

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`${api}/mixtapes`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await held;
      await route.continue();
    });
    const post = page.waitForRequest((req) => req.method() === 'POST' && req.url() === `${api}/mixtapes`);
    await builder.getByRole('button', { name: 'Publish mixtape (1)' }).click();
    await expect(builder.locator('[data-mixtape-builder-body]')).toHaveAttribute('inert', '');
    await page.locator('main').getByRole('button', { name: 'Add Second Track to mixtape' }).click();
    await expect(toasts(page).filter({ hasText: 'Publishing your mixtape… add it again in a moment.' })).toBeVisible();
    await expect(builder.getByText('1 song selected')).toBeVisible();

    release();
    expect((await post).postDataJSON().smols).toEqual(['smol-minted']);
    await expect(page).toHaveURL('/mixtapes/fixture-mixtape');
    expect(await page.evaluate(() => localStorage.getItem('smol:mixtape-draft'))).toBeNull();
  });

  test('P2-5: desktop "Edit X instead" moves focus to the title inside the docked panel', async ({ page, context }) => {
    await signInAs(context, 'k2');
    await seedDraft(page, {
      title: 'Creasy again',
      tracks: [
        { id: 'first-smol', title: 'First Track' },
        { id: 'second-smol', title: 'Second Track' },
      ],
    });
    await page.getByRole('button', { name: /Mixtape draft/ }).click();
    const builder = panel(page);
    await builder.getByRole('button', { name: 'Edit "Creasy Drops" instead' }).click();
    await expect(builder.getByRole('heading', { name: 'Editing · Creasy Drops' })).toBeVisible();
    await expect(builder.getByLabel('Title')).toBeFocused();
  });
});
