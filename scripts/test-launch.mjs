import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
    console.log("Testing launch...");
    try {
        const browser = await chromium.launch({ headless: false });
        console.log("Browser launched successfully!");
        await browser.close();

        console.log("\nTesting persistent context...");
        const userDataDir = path.join(__dirname, 'test_profile');
        const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
        console.log("Persistent context launched successfully!");
        await context.close();
    } catch (e) {
        console.error("ERROR:", e);
        process.exit(1);
    }
}
run();
