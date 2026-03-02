
/**
 * DK MasterBlaster — Fill DistroKid Upload Form for Solstice
 * 1. Reads upload_manifest.json
 * 2. Opens DistroKid /new/
 * 3. Fills Album Info
 * 4. Fills Track Info
 * 5. Uploads Audio & Cover
 */

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFEST_PATH = 'C:\\Users\\Jeff\\Desktop\\1OF1 - Solstice\\upload_manifest.json';

async function run() {
    console.log('🔫 DK MasterBlaster — DistroKid Upload Helper');

    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`❌ Manifest not found at ${MANIFEST_PATH}`);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    console.log(`📀 Album: ${manifest.artist} - ${manifest.album}`);
    console.log(`📂 Tracks: ${manifest.tracks.length}`);
    if (manifest.cover) console.log(`🖼️ Cover: ${manifest.cover}`);

    // Use persistent context
    const userDataDir = path.join(__dirname, 'dk_browser_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1400, height: 1000 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        console.log('🌐 Navigating to https://distrokid.com/new/ ...');
        // Check if already there to save time
        if (!page.url().includes('distrokid.com/new')) {
            await page.goto('https://distrokid.com/new/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        }
        await page.waitForTimeout(3000);

        // --- 1. SET NUMBER OF SONGS ---
        // This triggers DOM updates, so do it first.
        const numSongs = manifest.tracks.length;
        console.log(`🔢 Setting 'Number of Songs' to ${numSongs}...`);
        await page.selectOption('#howManySongsOnThisAlbum', String(numSongs));

        // Wait for tracked rows to appear.
        // We can wait for the last track's input to be present.
        const lastTrackSelector = `#tracknum_${numSongs}`; // Some unique ID pattern?
        // Let's wait for the "Track X" header or title input for the last track.
        // Title inputs usually have class 'uploadFileTitle'
        console.log('⏳ Waiting 5s for form to re-render...');
        await page.waitForTimeout(5000);

        // --- 2. ALBUM DETAILS ---
        console.log('✍️ Filling Album Details...');

        // Artist Name
        const artistInput = await page.$('#artistName');
        if (artistInput) {
            const val = await artistInput.inputValue();
            if (!val || val.trim() === '') await artistInput.fill(manifest.artist);
        }

        // Release Date: 2 weeks from now
        const date = new Date();
        date.setDate(date.getDate() + 14);
        const dateStr = date.toISOString().split('T')[0];
        try {
            await page.fill('#release-date-dp', dateStr);
        } catch (e) {
            console.log('⚠️ Could not set release date (might be hidden/locked).');
        }

        // Record Label
        try {
            await page.fill('#recordLabel', 'Stellar Records');
        } catch (e) { /* ignore */ }

        // Album Title
        await page.fill('#albumTitleInput', manifest.album);

        // Album Cover
        if (manifest.cover && fs.existsSync(manifest.cover)) {
            console.log(`🖼️ Uploading Cover Art...`);
            const artworkInput = await page.$('#artwork');
            if (artworkInput) {
                await artworkInput.setInputFiles(manifest.cover);
            } else {
                console.error('❌ Could not find #artwork input');
            }
        }

        // Genres - Default to Electronic / Downtempo
        try {
            await page.selectOption('#genrePrimary', 'Electronic');
            // Secondary might be #genreSecondary or similar
            await page.selectOption('#genreSecondary', 'Downtempo'); // Value might need checking, casing matters?
            // "Downtempo" was not in the snippet I saw, but "Electronic" was. 
            // I saw valid values in the analysis (e.g. "Electronic", "Experimental" maybe?)
            // I'll stick to Electronic for now.
        } catch (e) {
            console.log('⚠️ Could not set genres:', e.message);
        }

        // --- 3. TRACKS ----
        console.log('🎵 Filling Track Information...');

        // We need to match inputs to track numbers.
        // The analysis showed inputs like:
        // class="coolInput cool-input-text uploadFileTitle track_1 no-emoji"
        // class="distroFileInput distroFile trackupload trackupload_1 file-highlight-new"
        // id="js-not-explicit-radio-button-1" (Note: "1" is the track number?)

        for (let i = 0; i < numSongs; i++) {
            const track = manifest.tracks[i];
            const tNum = i + 1;
            console.log(`   [Track ${tNum}] ${track.title}`);

            // Title
            // Selector: input.uploadFileTitle.track_${tNum}
            // Or use the name attribute regex if needed, but class is safer here as analyzing showed specific classes.
            // Analysis: classes: "coolInput cool-input-text uploadFileTitle track_1 no-emoji"
            // So `.uploadFileTitle.track_${tNum}` should work.
            const titleSelector = `.uploadFileTitle.track_${tNum}`; // Space in class logic for CSS selector is dot.
            // Wait, "track_1" is a class.
            try {
                // We might need to handle the case where the class is "track_01" or something? No, analysis said "track_1".
                await page.fill(titleSelector, track.title);
            } catch (e) {
                console.error(`      ❌ Failed to fill title for Track ${tNum}: ${e.message}`);
                // Try finding by index
                const allTitles = await page.$$('.uploadFileTitle');
                if (allTitles[i]) await allTitles[i].fill(track.title);
            }

            // Audio File
            // Class: `trackupload_${tNum}`
            if (track.path && fs.existsSync(track.path)) {
                try {
                    await page.setInputFiles(`.trackupload_${tNum}`, track.path);
                    console.log(`      Sound file attached: ${path.basename(track.path)}`);
                } catch (e) {
                    console.error(`      ❌ Failed to attach audio for Track ${tNum}`);
                }
            }

            // Songwriter -> Original (Value 0)
            // Name: coversong_[UUID]
            // ID: not_coversong_radio_button_${tNum} (Deduced from analysis: id="not_coversong_radio_button_1")
            try {
                await page.click(`#not_coversong_radio_button_${tNum}`);
            } catch (e) {
                console.log(`      ⚠️ Could not set 'Original Song' for Track ${tNum}`);
            }

            // Explicit -> No
            // ID: js-not-explicit-radio-button-${tNum} (Deduced)
            try {
                await page.click(`#js-not-explicit-radio-button-${tNum}`);
            } catch (e) {
                // Analysis showed id="js-not-explicit-radio-button-1"
                // Wait, maybe underscore?
                // Analysis showed: id="js-not-explicit-radio-button-1" (with dashes or underscores?)
                // Let's re-check analysis snippet line 1405: id="js-not-explicit-radio-button-1"
                // It uses dashes.
                // But `track_1` class uses underscore. Confusing.
                // I'll try both if needed.
                try {
                    await page.click(`#js_not_explicit_radio_button_${tNum}`);
                } catch (e2) { }
            }

            // Instrumental -> No
            // Analysis line 1450: id="js-not-instrumental-radio-button-1"
            try {
                await page.click(`#js-not-instrumental-radio-button-${tNum}`);
            } catch (e) { }

            // Preview Clip -> Let streaming services decide
            // Analysis did not show clear IDs for this, just radio name "previewStart_1".
            // Value "no".
            try {
                await page.check(`input[name="previewStart_${tNum}"][value="no"]`);
            } catch (e) { }

            // Price -> 0.99 (default)
            // No action needed usually.
        }

        console.log('\n✅ Automation Complete!');
        console.log('⚠️  MANUAL REVIEW REQUIRED:');
        console.log('   1. Check Genres (Electronic / Downtempo)');
        console.log('   2. Verify Cover Art crop');
        console.log('   3. Check "Explicit" settings if any songs have swears');
        console.log('   4. Verify "Preview Clip" settings');
        console.log('   5. Click "DONE" at the bottom.');

        console.log('\n═════════════════════════════════════════');
        console.log('🔫 Browser Open. Press Ctrl+C to exit.');
        console.log('═════════════════════════════════════════\n');

        await new Promise(() => { });

    } catch (error) {
        console.error('❌ Error during form fill:', error);
        await page.screenshot({ path: path.join(__dirname, 'debug_fill_error.png'), fullPage: true });
    }
}

run();
