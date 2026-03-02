
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DIR_ORIG = String.raw`C:\Users\Jeff\Desktop\1OF1 - Solstice`;
const DIR_MASTER = String.raw`C:\Users\Jeff\Desktop\1OF1 - Solstice\mastered`;

console.log('🔍 Verifying audio lengths...');
console.log(`Originals: ${DIR_ORIG}`);
console.log(`Mastered:  ${DIR_MASTER}`);

// Check if directories exist
if (!fs.existsSync(DIR_ORIG)) {
    console.error(`❌ Original directory not found: ${DIR_ORIG}`);
    process.exit(1);
}
if (!fs.existsSync(DIR_MASTER)) {
    console.error(`❌ Mastered directory not found: ${DIR_MASTER}`);
    process.exit(1);
}

function getDuration(filePath) {
    try {
        // ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1
        const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const stdout = execSync(cmd).toString();
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) ? null : duration;
    } catch (e) {
        return null;
    }
}

function getFiles(dir, ext) {
    try {
        return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(ext));
    } catch (e) {
        console.error(`Error reading ${dir}:`, e.message);
        return [];
    }
}

const originals = getFiles(DIR_ORIG, '.mp3');
const mastered = getFiles(DIR_MASTER, '.wav');

console.log(`\nFound ${originals.length} originals and ${mastered.length} mastered tracks.`);

const comparison = [];
const origMap = {};

// Map originals by track number (from filename "01 - ...")
originals.forEach(f => {
    const match = f.match(/^(\d+)/);
    if (match) origMap[parseInt(match[1])] = f;
});

// Compare against mastered
let mismatchCount = 0;

mastered.forEach(mFile => {
    const match = mFile.match(/^(\d+)/);
    if (!match) return;

    const num = parseInt(match[1]);
    const oFile = origMap[num];

    if (oFile) {
        const dMaster = getDuration(path.join(DIR_MASTER, mFile));
        const dOrig = getDuration(path.join(DIR_ORIG, oFile));

        if (dMaster !== null && dOrig !== null) {
            const diff = Math.abs(dMaster - dOrig);
            if (diff >= 0.5) mismatchCount++;

            comparison.push({
                track: num,
                orig: oFile,
                master: mFile,
                dOrig,
                dMaster,
                diff
            });
        } else {
            console.error(`⚠️ Could not get duration for Track ${num}`);
        }
    } else {
        console.warn(`⚠️ No original found for mastered track ${num} (${mFile})`);
    }
});

// Output Table
console.log('\n--- Duration Comparison (Seconds) ---');
console.log('Trk | Original | Mastered | Diff  | Status');
console.log('----|----------|----------|-------|-------');

comparison.sort((a, b) => a.track - b.track).forEach(c => {
    const status = c.diff < 0.5 ? '✅ MATCH' : '⚠️ DIFF';
    console.log(
        `${String(c.track).padStart(3)} | ` +
        `${c.dOrig.toFixed(2).padStart(8)} | ` +
        `${c.dMaster.toFixed(2).padStart(8)} | ` +
        `${c.diff.toFixed(2).padStart(5)} | ` +
        `${status}`
    );
});

console.log('\n-------------------------------------');
if (mismatchCount === 0) {
    console.log('✅ All tracks match within 0.5s tolerance.');
} else {
    console.log(`⚠️  ${mismatchCount} tracks have mismatched lengths (> 0.5s)!`);
}
