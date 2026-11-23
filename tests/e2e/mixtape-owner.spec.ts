import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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

function fakeSmolJwt(sub: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, key: `key-${sub}` })).toString('base64url');
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
      edit: localStorage.getItem('smol:mixtape-edit'),
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
    expect(await page.evaluate(() => localStorage.getItem('smol:mixtape-edit'))).toBeNull();
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
    await expect(toasts(page).filter({ hasText: 'Merged into "One Song Wonder". 3 songs added.' })).toBeVisible();
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
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(page.locator(`[data-mixtape-card="${id('solo')}"]`)).toHaveCount(0);

    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(toasts(page).filter({ hasText: 'Restored "One Song Wonder".' })).toBeVisible();
    await expect(page.locator(`[data-mixtape-card="${id('solo')}"]`)).toBeVisible();
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
    const builder = openDialog(page, 'Creasy again');
    await expect(builder.locator('[data-mixtape-coaching]')).toContainText('Heads up: this matches your mixtape "Creasy Drops".');
    await capture(page, 'builder-coaching-1440.png');
    await builder.getByRole('button', { name: 'Edit "Creasy Drops" instead' }).click();
    await expect(openDialog(page, 'Editing · Creasy Drops').getByRole('heading', { name: 'Editing · Creasy Drops' })).toBeVisible();
    await capture(page, 'builder-edit-1440.png');
  });
});
