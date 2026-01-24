import { expect, test } from '@playwright/test';

const sampleSongId = 'a96760878f1cc19af6e190bed5c45fe55d4ea16d3c9f3d61db440a61e1ff4d87';

test('home navigation reaches radio builder', async ({ page }) => {
  // Block external API calls to force snapshot fallback and speed up test
  await page.route('**/api.smol.xyz/**', route => route.abort());

  await page.goto('/');

  // Dismiss Onboarding if present
  // Wait for initial animations
  await page.waitForTimeout(2000);

  const guestBtn = page.getByRole('button', { name: /Enter as Guest/i });
  if (await guestBtn.isVisible()) {
    await guestBtn.click({ force: true });
    // Allow dismissal animation
    await page.waitForTimeout(1000);
  }

  const radioLink = page.getByRole('link', { name: 'Radio' });
  await expect(radioLink).toBeVisible();
  await radioLink.click({ force: true });

  await expect(page).toHaveURL(/\/radio/);
  await expect(page).toHaveURL(/\/radio/);
  // Heading might be split across spans, verify standard text presence
  await expect(page.locator('h1').filter({ hasText: /SMOL/i })).toBeVisible();

  // Verify Audio Logic Fix: Only ONE audio element should exist (Global Player)
  // If duplicate existed (one in Layout, one in RadioPlayer), this would be > 1
  await expect(page.locator('audio')).toHaveCount(1);
});

test('song page includes MusicRecording schema with datePublished', async ({ page }) => {
  await page.goto(`/${sampleSongId}`);
  await page.waitForLoadState('domcontentloaded');

  const rawBlocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  const blocks = rawBlocks.flatMap((content) => {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      return [] as Record<string, unknown>[];
    }
  });

  const recording = blocks.find(
    (block) => block['@type'] === 'MusicRecording',
  ) as { datePublished?: string } | undefined;

  expect(recording?.datePublished).toBeTruthy();
});
