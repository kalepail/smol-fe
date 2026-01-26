import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PROGRESS_FILE = 'scripts/ralph/progress.txt';
const DIRECTIONS = ['xlm_to_kale', 'kale_to_xlm'];
let cycleCount = 0;

function logToProgress(message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [SPAMMER] ${message}\n`;
    fs.appendFileSync(PROGRESS_FILE, formattedMessage);
    console.log(formattedMessage.trim());
}

async function runCycle() {
    cycleCount++;
    const direction = DIRECTIONS[cycleCount % DIRECTIONS.length];

    logToProgress(`Cycle #${cycleCount} START: ${direction}`);

    try {
        // Run audit:swaps with current direction
        const output = execSync(`pnpm audit:swaps --direction ${direction} --skip-sponsor`, {
            stdio: 'pipe',
            encoding: 'utf-8'
        });

        if (output.includes('✅ Audit Cycle Complete')) {
            logToProgress(`Cycle #${cycleCount} SUCCESS: ${direction}`);
        } else {
            logToProgress(`Cycle #${cycleCount} UNCERTAIN: Response missing success marker.`);
            console.log(output);
        }
    } catch (error) {
        logToProgress(`Cycle #${cycleCount} FATAL ERROR: ${error.message}`);
        console.error(error.stdout || error.stderr || error.message);
        process.exit(1); // "Make no mistakes" - stop on first failure
    }

    // Interval: 3-5 seconds (3000ms - 5000ms)
    const delay = Math.floor(Math.random() * 2000) + 3000;
    logToProgress(`Next cycle in ${delay}ms...`);
    setTimeout(runCycle, delay);
}

console.log('🚀 Ralph Spammer started at 3-5s intervals');
console.log('Press Ctrl+C to stop');
logToProgress('STRESS TEST INITIALIZED');

runCycle();
