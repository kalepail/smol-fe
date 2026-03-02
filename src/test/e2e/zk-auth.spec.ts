
import { test, expect } from '@playwright/test';

test('ZK Auth Flow: Navigate -> Prove -> Verify', async ({ page }) => {
    // 1. Navigate to The Farm
    await page.goto('/labs/the-farm');

    // Verify initial load
    const title = page.locator('.title-farm');
    await expect(title).toBeVisible();

    // 2. Set Balance via Hook (requires DEV mode)
    // We need to wait for the component to mount and expose the hook.
    await page.waitForFunction(() => (window as any).__setBalance);

    // Set sufficient balance (e.g. 500 KALE, min is 100)
    // balanceState stores bigint. JSON.stringify handles basic types but passing bigint to evaluate might need care?
    // Playwright evaluate handles serializable data. BigInt needs wrapper or manual handling.
    // We'll pass a string/number and let value be converted? 
    // Hook takes `bigint`.

    await page.evaluate(() => {
        // @ts-ignore
        window.__setBalance(5000000000n); // 500 * 10^7
    });

    // 3. Verify UI Updates
    const btn = page.locator('.btn-prove');
    await expect(btn).toBeEnabled();
    await expect(page.locator('.tier-name')).toContainText('SEEDLING'); // Assuming 500 is seedling

    // 4. Click Generate Proof
    await btn.click();

    // 5. Verify Progress States
    await expect(page.locator('.proving-sub')).toContainText('Preparing circuit...');
    // Force wait for proof gen (it might take >5s)
    // We can increase timeout.

    // Checking for "Generating proof..."
    await expect(page.locator('.proving-sub')).toContainText('Generating proof...');

    // 6. Verify Success
    // If server verification works (mocked?), we see success.
    // This test hits the REAL dev server API. 
    // If the dev server 500s (as seen in unit test), this step will fail or show error.

    // We expect success OR a specific error.
    // Ideally success.
    try {
        await expect(page.locator('.proving-text')).toContainText('ZK PROOF VERIFIED', { timeout: 30000 });
    } catch (e) {
        // If it failed, check for error message
        const err = page.locator('.proof-error');
        if (await err.isVisible()) {
            console.error("Proof failed with error:", await err.textContent());
            throw new Error(`Proof Generation Failed: ${await err.textContent()}`);
        }
        throw e;
    }

});
