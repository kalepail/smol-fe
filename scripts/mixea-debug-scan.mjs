import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = 'C:\\Users\\Jeff\\Desktop\\1OF1 - Solstice';
const MIXEA_URL = 'https://distrokid.com/mixea/';
const TEST_FILE = "01 - STARLACE.mp3";

async function run() {
    console.log("🔍 Starting Mixea UI Scan (Debug)...");

    const userDataDir = path.join(__dirname, 'mixea_browser_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        acceptDownloads: true,
        viewport: { width: 1280, height: 900 },
        args: ['--enable-automation', '--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        console.log("Navigating to Mixea...");
        await page.goto(MIXEA_URL);

        // PAUSE FOR USER STATE CHECK
        console.log("\n🛑 PAUSED: Please ensure you are logged in and the 'Upload' or 'Editor' page is visible.");
        console.log("👉 If you need to re-upload the file, do it manually or let the script try.");

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(r => rl.question('Press ENTER when ready to scan... ', () => { rl.close(); r(); }));

        // Attempt to upload IF not already in editor
        if (await page.locator('input[type="file"]').count() > 0) {
            console.log("   - Uploading test file...");
            await page.locator('input[type="file"]').setInputFiles(path.join(SOURCE_DIR, TEST_FILE));

            console.log("   - Waiting for editor...");
            await page.waitForSelector('#intensity-range', { state: 'visible', timeout: 60000 });
        }

        // Wait for download button area
        console.log("   - Waiting for Download area...");
        await page.waitForTimeout(5000); // Wait for animations

        // 1. SCAN DOWNLOAD BUTTONS
        console.log("\n🔎 SCANNING FOR DOWNLOAD BUTTONS:");
        const buttons = await page.getByRole('button').all();
        for (const btn of buttons) {
            if (await btn.isVisible()) {
                const text = await btn.innerText();
                const cls = await btn.getAttribute('class');
                if (text.toLowerCase().includes('download') || text.toLowerCase().includes('ultra') || cls?.includes('download')) {
                    console.log(`   found button: "${text}" (class: ${cls})`);
                }
            }
        }

        // 2. CLICK DOWNLOAD & SCAN
        console.log("\n👉 Clicking 'Download' to open menu...");
        let downloadBtn = page.getByRole('button', { name: 'Download' }).first();
        if (!await downloadBtn.isVisible()) {
            downloadBtn = page.locator('.download-cta button').first();
        }
        if (await downloadBtn.isVisible()) {
            await downloadBtn.click();
            await page.waitForTimeout(2000);

            console.log("\n🔎 SCANNING MENU OPTIONS:");
            const items = await page.locator('li, div[role="option"], button').all();
            for (const item of items) {
                if (await item.isVisible()) {
                    const text = await item.innerText();
                    if (text.includes("Ultra") || text.includes("WAV") || text.includes("MP3")) {
                        console.log(`   found option: "${text}"`);
                        // Try to see if it has a click listener or is a link
                        const href = await item.getAttribute('href');
                        if (href) console.log(`      -> href: ${href}`);
                    }
                }
            }

            // 3. CLICK ULTRA & SCAN AGAIN
            console.log("\n👉 Clicking 'Ultra HD' option...");
            const ultraHd = page.locator('li, button, div').filter({ hasText: 'Ultra HD' }).first();
            if (await ultraHd.isVisible()) {
                await ultraHd.click();
                console.log("   Clicked. Waiting 5s for UI update...");
                await page.waitForTimeout(5000);

                console.log("\n🔎 SCANNING AFTER ULTRA CLICK:");
                // Look for ANY button specifically now
                const postClickButtons = await page.getByRole('button').all();
                for (const btn of postClickButtons) {
                    if (await btn.isVisible()) {
                        const text = await btn.innerText();
                        // Log all visible buttons to see if a specific "Download Now" appeared
                        console.log(`   visible button: "${text}"`);
                    }
                }

                // Also look for links
                const links = await page.getByRole('link').all();
                for (const link of links) {
                    if (await link.isVisible()) {
                        const text = await link.innerText();
                        if (text.toLowerCase().includes('download')) {
                            console.log(`   visible link: "${text}"`);
                        }
                    }
                }
            } else {
                console.log("   ❌ Ultra HD option not found!");
            }

        } else {
            console.log("   ❌ Download button not found!");
        }

    } catch (e) {
        console.error("❌ Scan Error:", e);
    } finally {
        console.log("\nScan complete.");
        // process.exit(0); // keep open for user
    }
}

run();
