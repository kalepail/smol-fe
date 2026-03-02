import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURATION
const SOURCE_DIR = 'C:\\Users\\Jeff\\Desktop\\1OF1 - Solstice';
const OUTPUT_DIR = path.join(SOURCE_DIR, 'Mastered');
const MIXEA_URL = 'https://distrokid.com/mixea/';

// The 19 tracks
const filesToMaster = [
    "01 - STARLACE.mp3",
    "02 - MOONLIT CIRCUITS.mp3",
    "03 - VELVET AFTERBURN.mp3",
    "04 - SILK CIRCUIT.mp3",
    "05 - TIDAL LIGHT.mp3",
    "06 - ORBIT.mp3",
    "07 - DRAGONFRUIT.mp3",
    "08 - LIGHTRUNNER.mp3",
    "09 - NIGHTSHIFT STELLAR.mp3",
    "10 - MOONSTEP.mp3",
    "11 - MIRAGE.mp3",
    "12 - GLASS COMET.mp3",
    "13 - SILVER TONGUE.mp3",
    "14 - GEMINI.mp3",
    "15 - OMG NEW USERS.mp3",
    "16 - BLACK CARD.mp3",
    "17 - PHANTOM THREAD.mp3",
    "18 - DUSK.mp3",
    "19 - STARSHIFT.mp3"
];

async function run() {
    console.log("🚀 Starting Mixea Automation v16 (Adaptive)...");

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Created output directory: ${OUTPUT_DIR}`);
    }

    const userDataDir = path.join(__dirname, 'mixea_browser_data');
    console.log(`   📂 Browser Profile: ${userDataDir}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        acceptDownloads: true,
        viewport: { width: 1280, height: 900 },
        args: ['--enable-automation', '--no-sandbox', '--disable-setuid-sandbox']
    });

    context.on('page', page => {
        page.on('download', download => console.log(`   ⬇️ Download started: ${download.suggestedFilename()}`));
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        console.log("Navigating to Mixea...");
        await page.goto(MIXEA_URL);

        console.log("\n⚠️  PLEASE LOG IN TO DISTROKID/MIXEA IN THE BROWSER WINDOW ⚠️");

        // Wait for EITHER upload interface OR mastered tracks list
        console.log("⏳ Waiting for interface load (Upload or Mastered List)...");
        await page.waitForFunction(() => {
            return document.querySelector('input[type="file"]') ||
                document.body.innerText.includes('My mastered tracks') ||
                document.body.innerText.includes('Master a new track');
        }, { timeout: 0 });

        console.log("✅ Interface detected!");

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.close();

        for (const filename of filesToMaster) {
            const filePath = path.join(SOURCE_DIR, filename);
            const outputFilePath = path.join(OUTPUT_DIR, filename.replace(/\.mp3$/i, '.wav'));

            if (fs.existsSync(outputFilePath)) {
                console.log(`Skipping ${filename} (already exists in Mastered folder)`);
                continue;
            }

            console.log(`\n🎧 Processing: ${filename}`);

            // ADAPTIVE CHECK: Is it already mastered with correct settings?
            console.log("   - Checking if already mastered with target settings...");
            const masteredRow = page.locator('.finished-tracks-row').filter({ hasText: filename }).first();
            const exists = await masteredRow.isVisible();

            let settingsMatch = false;
            if (exists) {
                const isGenerating = await masteredRow.innerText().then(text => text.includes('Generating download files'));

                if (isGenerating) {
                    console.log(`   - ⏳ Track is still generating. Will wait and re-check or re-master if needed.`);
                    settingsMatch = false;
                } else {
                    const settingsSpan = masteredRow.locator('span[id^="js_settings_"]');
                    const intensity = await settingsSpan.getAttribute('data-intensity');
                    const eq = await settingsSpan.getAttribute('data-eq');

                    console.log(`   - ℹ️ Found: ${filename} (Intensity: ${intensity}, EQ: ${eq})`);

                    // TARGETS: Intensity="High", EQ="Neutral"
                    if (intensity === 'High' && (eq === 'Neutral' || eq === 'Medium')) {
                        settingsMatch = true;
                        console.log(`   - ✨ Settings match! Skipping upload.`);
                    } else {
                        console.log(`   - ⚠️ Settings MISMATCH (Target: High/Neutral). Will re-master.`);
                    }
                }
            }

            if (!settingsMatch) {
                if (exists) {
                    console.log("   - 🔄 Re-mastering: Initiating 'Master a new track' flow...");
                    // Try to click "Master a new track" button
                    const newTrackBtn = page.locator('#upload-music-button, .new-track-button-mobile').filter({ hasText: /Master a new track/i }).first();
                    if (await newTrackBtn.isVisible()) {
                        await newTrackBtn.click();
                    } else {
                        await page.goto(MIXEA_URL);
                    }
                    await page.waitForTimeout(2000);
                }

                console.log(`   - 📤 Starting upload flow for: ${filename}`);
                const fileInput = page.locator('input[type="file"]').first();
                await fileInput.setInputFiles(filePath);

                console.log("   - File uploaded. Waiting for processing/editor UI...");
                await page.waitForSelector('#intensity-range', { state: 'visible', timeout: 300000 });
                console.log("   - ✅ Editor UI ready.");

                // DISCOVERY PHASE - Exhaustive 5-point scan for Intensity only
                console.log("   - Starting rigorous intensity discovery (Step-by-Step Security)...");
                const mapping = {};
                const slider = page.locator('#intensity-range');
                const box = await slider.boundingBox();

                if (box) {
                    console.log(`     Slider Box: ${JSON.stringify(box)}`);
                    for (let i = 0; i <= 4; i++) {
                        // Use 10% buffers to avoid edge-case click failures
                        const x = box.x + (box.width * 0.1) + ((box.width * 0.8) * (i / 4));
                        const y = box.y + (box.height / 2);

                        console.log(`     Clicking Position ${i} at (${Math.round(x)}, ${Math.round(y)})...`);
                        await page.mouse.click(x, y);
                        await page.waitForTimeout(2500); // Robust wait for UI

                        const label = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('span, div, b, p, strong'))
                                .map(s => s.innerText.trim())
                                .find(t => t.includes('Intensity')) || "NOT FOUND";
                        });

                        mapping[i] = label;
                        console.log(`       -> Result: ${label}`);
                        await page.screenshot({ path: path.join(__dirname, `debug_intensity_step_${i}.png`) });
                    }
                }

                // Target Selection (Visual Confirmation: Pos 4 is High, Pos 0 is Low)
                const intensityPos = 4;
                console.log(`   🎯 Selected Position: ${intensityPos} | EQ: PRESERVED (Don't touch)`);

                if (intensityPos === null) {
                    // Fallback to Pos 0 or 4 if text fails, but better to error for safety
                    throw new Error(`Could not locate 'High Intensity' label in any of the 5 points! Check logs/screenshots.`);
                }

                // Final Application
                console.log(`   - Applying final target: Position ${intensityPos}`);
                const fx = box.x + (box.width * 0.1) + ((box.width * 0.8) * (intensityPos / 4));
                const fy = box.y + (box.height / 2);
                await page.mouse.click(fx, fy);
                await page.waitForTimeout(2000);

                // Final Check
                const finalLabel = await page.evaluate(() => {
                    const texts = Array.from(document.querySelectorAll('span, div, b')).map(s => s.innerText);
                    const i = texts.find(t => t.includes('Intensity')) || "NOT FOUND";
                    const e = texts.find(t => t.includes('EQ')) || "NOT FOUND";
                    return { i, e };
                });
                console.log(`   ✅ Confirmed: ${finalLabel.i} | ${finalLabel.e || 'EQ untouched'}`);

                if (!finalLabel.i.toLowerCase().includes('high')) {
                    throw new Error(`CRITICAL: Final Label is '${finalLabel.i}', expected High Intensity.`);
                }

                // WAIT FOR MASTERING
                console.log("   - Waiting for mastering process (0% -> 100%)...");
                await page.locator('button:has-text("Download mastered track")').waitFor({ state: 'visible', timeout: 300000 });
                console.log("   - ✨ Mastering complete!");
                await page.screenshot({ path: path.join(__dirname, 'debug_mastering_finished.png') });
            }

            // DOWNLOAD FLOW (Multi-Strategy)
            try {
                console.log("   - Initiating Download sequence...");

                // Find the Download button
                let downloadBtn;
                if (exists && settingsMatch) {
                    downloadBtn = masteredRow.locator('button').filter({ hasText: /Download/i }).first();
                } else {
                    downloadBtn = page.locator('button').filter({ hasText: /Download/i }).first();
                }

                await downloadBtn.waitFor({ state: 'visible', timeout: 30000 });
                console.log("   - Clicking Download dropdown...");
                await downloadBtn.click();
                await page.waitForTimeout(2000);
                await page.screenshot({ path: path.join(__dirname, 'debug_dropdown_state.png') });

                // Look for Ultra HD specifically
                console.log("   - Looking for 'Ultra HD' option...");
                const ultraHd = page.locator('div, span, li, button, a').filter({ hasText: /Ultra HD/i }).first();
                await ultraHd.waitFor({ state: 'visible', timeout: 15000 });

                // Log what element we found
                const tagName = await ultraHd.evaluate(el => `${el.tagName} | href=${el.href || 'none'} | onclick=${el.onclick ? 'yes' : 'no'}`);
                console.log(`   - Found Ultra HD element: ${tagName}`);

                // STRATEGY: Set up ALL listeners BEFORE clicking
                console.log("   - Setting up download capture (3 strategies)...");

                // Strategy 1: Standard download event
                const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);

                // Strategy 2: New page/popup
                const newPagePromise = context.waitForEvent('page', { timeout: 60000 }).catch(() => null);

                // Strategy 3: Network response with audio content
                let audioResponseUrl = null;
                const responseHandler = (response) => {
                    const ct = response.headers()['content-type'] || '';
                    const url = response.url();
                    if (ct.includes('audio') || ct.includes('octet-stream') || url.includes('.wav') || url.includes('.mp3')) {
                        console.log(`   - 🎵 Audio response detected: ${url.substring(0, 100)}...`);
                        audioResponseUrl = url;
                    }
                };
                page.on('response', responseHandler);

                console.log("   - Clicking Ultra HD...");
                await ultraHd.click();
                await page.waitForTimeout(3000);
                await page.screenshot({ path: path.join(__dirname, 'debug_after_ultra_click.png') });

                // Wait for whichever strategy wins
                const [download, newPage] = await Promise.all([downloadPromise, newPagePromise]);

                // Clean up listener
                page.off('response', responseHandler);

                if (download) {
                    // Strategy 1 won: standard download
                    console.log(`   - Strategy 1: Download event caught: ${download.suggestedFilename()}`);
                    await download.saveAs(outputFilePath);
                    console.log(`   ✅ Saved as: ${outputFilePath}`);
                } else if (newPage) {
                    // Strategy 2 won: new tab opened with file
                    console.log(`   - Strategy 2: New page opened: ${newPage.url()}`);
                    // Wait for the new page to load, then try to download from its URL
                    await newPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => { });
                    const fileUrl = newPage.url();
                    console.log(`   - Fetching file from: ${fileUrl}`);

                    // Use fetch to download the file
                    const response = await page.request.get(fileUrl);
                    const buffer = await response.body();
                    fs.writeFileSync(outputFilePath, buffer);
                    console.log(`   ✅ Saved from new tab: ${outputFilePath} (${buffer.length} bytes)`);
                    await newPage.close();
                } else if (audioResponseUrl) {
                    // Strategy 3: intercepted audio response URL
                    console.log(`   - Strategy 3: Audio URL intercepted: ${audioResponseUrl}`);
                    const response = await page.request.get(audioResponseUrl);
                    const buffer = await response.body();
                    fs.writeFileSync(outputFilePath, buffer);
                    console.log(`   ✅ Saved from intercepted URL: ${outputFilePath} (${buffer.length} bytes)`);
                } else {
                    // All strategies failed, take screenshots and check for a direct link
                    console.log("   - All 3 strategies timed out. Checking for direct download links...");
                    await page.screenshot({ path: path.join(__dirname, 'debug_download_fail.png'), fullPage: true });

                    // Last resort: look for any anchor with .wav href
                    const wavLink = await page.evaluate(() => {
                        const links = document.querySelectorAll('a[href*=".wav"], a[href*="download"]');
                        return links.length > 0 ? links[0].href : null;
                    });

                    if (wavLink) {
                        console.log(`   - Found direct WAV link: ${wavLink}`);
                        const resp = await page.request.get(wavLink);
                        const buf = await resp.body();
                        fs.writeFileSync(outputFilePath, buf);
                        console.log(`   ✅ Saved from direct link: ${outputFilePath} (${buf.length} bytes)`);
                    } else {
                        throw new Error("All download strategies failed. No download event, new page, audio response, or direct link found.");
                    }
                }

                // If we were in the editor, go back to the main list for the next track
                if (!settingsMatch) {
                    console.log("   - Returning to main list...");
                    await page.goto(MIXEA_URL);
                    await page.waitForTimeout(3000);
                }
            } catch (dlErr) {
                console.error(`   ❌ Download failed for ${filename}:`, dlErr.message);
                await page.screenshot({ path: path.join(__dirname, `error_${filename}.png`), fullPage: true });
                throw dlErr;
            }

            // STOP AFTER FIRST TRACK FOR VERIFICATION
            // console.log("\n👋 Stopping after first track for verification. Resume full batch next.");
            // break;
        }
    } catch (error) {
        console.error("\n❌ Global Script Failure:", error);
    } finally {
        console.log("\nv16 finished. Check the browser or logs.");
        if (context) await context.close();
    }
}

run();
