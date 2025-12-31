import fs from 'fs';

const API_URL = 'https://api.smol.xyz'; // Defaulting to root.
const APP_URL = 'https://app.smol.xyz';

async function main() {
    // Try to fetch all if possible via query, though API might ignore
    // The 'smols.ts' fetchSmols() just calls root.
    const fetchUrl = `${API_URL}?limit=5000`;
    console.log(`Fetching song list from ${fetchUrl}...`);

    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    const smols = data.smols || [];
    console.log(`Processing ${smols.length} songs...`);

    const results = [];

    // No HEAD requests - they fail/return null length.
    // Just generate list.

    smols.forEach(s => {
        const id = s.Id;
        const title = s.lyrics?.title || s.Title || 'Untitled';

        results.push({
            title,
            duration: 'Unknown',
            link: `${APP_URL}/${id}`
        });
    });

    // Generate MD
    let md = `# Smol Song Runtimes\n\nGenerated: ${new Date().toISOString()}\n\n`;
    md += `**Total Songs**: ${results.length}\n`;
    md += `*Note: Duration metadata is not currently available via public API headers.*\n\n`;
    md += `| Title | Duration | Link |\n|---|---|---|\n`;

    results.forEach(r => {
        // Escape pipes
        const safeTitle = r.title.replace(/\|/g, '-').trim();
        md += `| ${safeTitle} | ${r.duration} | [View](${r.link}) |\n`;
    });

    fs.writeFileSync('song_runtimes.md', md);
    console.log('Done. Written to song_runtimes.md');
}

main().catch(console.error);
