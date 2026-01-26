
const fs = require('fs');

const TARGET_ADDRESS = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";
const INPUT_FILE = "universal-smols.json";
const OUTPUT_FILE = "cbno_discography.json";

try {
    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    const smols = JSON.parse(rawData);

    const artistSongs = smols.filter(s =>
        s.Address === TARGET_ADDRESS ||
        (s.kv_do && s.kv_do.payload && s.kv_do.payload.address === TARGET_ADDRESS)
    );

    const extractedData = artistSongs.map(s => ({
        Title: s.Title,
        Prompt: s.kv_do?.payload?.prompt || s.Prompt,
        Lyrics: s.kv_do?.lyrics?.lyrics || s.Lyrics,
        Style: s.kv_do?.lyrics?.style || s.Tags,
        Created_At: s.Created_At
    }));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(extractedData, null, 2));
    console.log(`Extracted ${artistSongs.length} songs to ${OUTPUT_FILE}`);

} catch (error) {
    console.error("Error extracting songs:", error);
}
