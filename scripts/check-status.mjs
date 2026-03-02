import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function check() {
    const userDataDir = path.join(__dirname, 'mixea_browser_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        viewport: { width: 1280, height: 900 }
    });
    const page = await context.newPage();
    await page.goto('https://distrokid.com/mixea/');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(__dirname, 'latest_status.png'), fullPage: true });

    const tracks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.finished-tracks-row')).map(row => {
            const title = row.querySelector('b')?.innerText || 'Unknown';
            const settings = row.innerText;
            const status = row.innerText.includes('Generating') ? 'Generating' : 'Ready';
            return { title, settings, status };
        });
    });
    console.log(JSON.stringify(tracks, null, 2));
    await context.close();
}

check();
