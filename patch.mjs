import fs from 'fs';
const path = 'src/components/radio/RadioBuilder.svelte';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);

const startLine = 682;
const endLine = 761;

// Verify (0-indexed)
// Line 682 is index 681
if (!lines[startLine - 1].includes('{#if generatedPlaylist.length > 0}')) {
    console.error(`Mismatch start at ${startLine}: ${lines[startLine - 1]}`);
    process.exit(1);
}
// Line 761 is index 760
if (!lines[endLine - 1].includes('</div>')) {
    console.error(`Mismatch end at ${endLine}: ${lines[endLine - 1]}`);
    process.exit(1);
}

const newBlock = `  {#if generatedPlaylist.length > 0}
    <RadioResults 
      playlist={generatedPlaylist}
      {stationName}
      {stationDescription}
      {currentIndex}
      {isSavingMixtape}
      onNext={playNext}
      onPrev={playPrev}
      onSelect={playSongAtIndex}
      onSaveMixtape={saveAsMixtape}
    />`;

lines.splice(startLine - 1, endLine - startLine + 1, newBlock);

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Success');
