
const fs = require('fs');

const INPUT_FILE = "cbno_discography.json";

try {
    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    const songs = JSON.parse(rawData);

    // Sort by date
    songs.sort((a, b) => new Date(a.Created_At) - new Date(b.Created_At));

    const totalSongs = songs.length;
    const genres = {};
    const promptKeywords = {};
    const titleKeywords = {};
    const series = {}; // Check for "1OF1" or other tags in titles

    songs.forEach(s => {
        // Genre Analysis
        const style = Array.isArray(s.Style) ? s.Style : [s.Style];
        style.forEach(Tag => {
            if (!Tag) return;
            const t = Tag.toString().toLowerCase().trim();
            genres[t] = (genres[t] || 0) + 1;
        });

        // Series/Tag Analysis (e.g. "1OF1")
        if (s.Title && s.Title.includes("—")) {
            const prefix = s.Title.split("—")[0].trim();
            series[prefix] = (series[prefix] || 0) + 1;
        }

        // Prompt Analysis (simple keyword freq)
        if (s.Prompt) {
            const words = s.Prompt.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
            words.forEach(w => {
                if (w.length > 4) promptKeywords[w] = (promptKeywords[w] || 0) + 1;
            });
        }
    });

    const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const topSeries = Object.entries(series).sort((a, b) => b[1] - a[1]);
    const topPromptWords = Object.entries(promptKeywords).sort((a, b) => b[1] - a[1]).slice(0, 20);

    // Identify "Eras" (group by month/year)
    const eras = {};
    songs.forEach(s => {
        const date = s.Created_At ? s.Created_At.substring(0, 7) : "Unknown"; // YYYY-MM
        eras[date] = (eras[date] || 0) + 1;
    });

    // Sample standout tracks (first, last, random)
    const samples = [
        songs[0],
        songs[Math.floor(totalSongs / 2)],
        songs[totalSongs - 1]
    ];

    console.log("=== CBNO ARTIST PROFILE ===");
    console.log(`Total Discography: ${totalSongs} tracks`);

    console.log("\n=== TOP GENRES ===");
    topGenres.forEach(([g, c]) => console.log(`- ${g}: ${c}`));

    console.log("\n=== SERIES / ALBUMS ===");
    topSeries.forEach(([s, c]) => console.log(`- "${s}": ${c}`));

    console.log("\n=== CHRONOLOGY (Activity per Month) ===");
    Object.entries(eras).sort().forEach(([d, c]) => console.log(`- ${d}: ${c} songs`));

    console.log("\n=== PROMPT OBSESSIONS (Most used words) ===");
    console.log(topPromptWords.map(p => p[0]).join(", "));

    console.log("\n=== STANDOUT SAMPLES ===");
    samples.forEach(s => {
        console.log(`\n[${s.Created_At}] ${s.Title}`);
        console.log(`Style: ${JSON.stringify(s.Style)}`);
        console.log(`Prompt Snippet: ${s.Prompt ? s.Prompt.substring(0, 100) : "N/A"}...`);
    });

} catch (error) {
    console.error("Error analyzing songs:", error);
}
