
import fs from 'fs';

const filePath = "C:/Users/Jeff/Mixtape Auto/smol-fe/src/components/player/GlobalPlayer.svelte";
const content = fs.readFileSync(filePath, 'utf-8');

let divCount = 0;
let ifCount = 0;
let eachCount = 0;

let lines = content.split('\n');
let blockStack = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Simple regex for counting - strict parsing would be better but this catches imbalance
    const divsOpen = (line.match(/<div\b/g) || []).length;
    const divsClose = (line.match(/<\/div>/g) || []).length;

    const ifsOpen = (line.match(/{#if\b/g) || []).length;
    const ifsClose = (line.match(/{\/if}/g) || []).length;

    const eachsOpen = (line.match(/{#each\b/g) || []).length;
    const eachsClose = (line.match(/{\/each}/g) || []).length;

    divCount += divsOpen - divsClose;
    ifCount += ifsOpen - ifsClose;
    eachCount += eachsOpen - eachsClose;

    // Track detailed stack for debugging
    if (divsOpen > divsClose) blockStack.push(`div (Line ${i + 1})`);
    if (divsClose > divsOpen) {
        if (blockStack.length > 0 && blockStack[blockStack.length - 1].startsWith('div')) {
            blockStack.pop();
        } else {
            console.log(`Extra </div> at Line ${i + 1}. Current Stack:`, blockStack);
        }
    }

    if (ifsOpen > ifsClose) blockStack.push(`if (Line ${i + 1})`);
    if (ifsClose > ifsOpen) {
        if (blockStack.length > 0 && blockStack[blockStack.length - 1].startsWith('if')) {
            blockStack.pop();
        } else {
            console.log(`Extra {/if} at Line ${i + 1}. Current Stack:`, blockStack);
        }
    }

    if (eachsOpen > eachsClose) blockStack.push(`each (Line ${i + 1})`);
    if (eachsClose > eachsOpen) {
        if (blockStack.length > 0 && blockStack[blockStack.length - 1].startsWith('each')) {
            blockStack.pop();
        } else {
            console.log(`Extra {/each} at Line ${i + 1}. Current Stack:`, blockStack);
        }
    }
}

console.log(`Div Diff: ${divCount}`);
console.log(`If Diff: ${ifCount}`);
console.log(`Each Diff: ${eachCount}`);
if (blockStack.length > 0) {
    console.log("Unclosed Blocks:", blockStack);
}
