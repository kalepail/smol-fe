import fs from 'fs';
import path from 'path';

/**
 * Tag Normalization Logic
 */
const TAG_MAP = {
    'hiphop': 'hiphop',
    'hip hop': 'hiphop',
    'hip-hop': 'hiphop',
    'female vocal': 'female vocals',
    'female vocals': 'female vocals',
    'female voice': 'female vocals',
    'male vocal': 'male vocals',
    'male vocals': 'male vocals',
    'male voice': 'male vocals',
    'kpop': 'kpop',
    'k-pop': 'kpop',
    'k pop': 'kpop',
    'r&b': 'rnb',
    'r n b': 'rnb',
    'rnb': 'rnb',
    'edm': 'edm',
    'e d m': 'edm',
    'synth wave': 'synthwave',
    'synth-wave': 'synthwave',
    'synthwave': 'synthwave',
};

function normalizeTag(tag) {
    if (!tag) return null;
    let normalized = tag.toLowerCase().trim()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "") // Remove punctuation
        .replace(/\s+/g, " "); // Collapse whitespace

    return TAG_MAP[normalized] || normalized;
}

const SNAPSHOT_PATH = 'public/data/GalacticSnapshot.json';
const OUTPUT_PATH = 'public/data/tag_graph.json';

async function generate() {
    console.log("🚀 Starting Vibe Matrix Generation...");

    if (!fs.existsSync(SNAPSHOT_PATH)) {
        console.error("❌ Snapshot not found at", SNAPSHOT_PATH);
        return;
    }

    const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    console.log(`📊 Loaded ${data.length} songs.`);

    // 1. Build Song x Tag Incidence
    const tagToDisplay = {}; // normalized -> original best display
    const tagCounts = {}; // tag -> frequency (df)
    const songToTags = data.map(smol => {
        const rawTags = new Set();
        if (smol.Tags) smol.Tags.forEach(t => rawTags.add(t));
        if (smol.lyrics?.style) smol.lyrics.style.forEach(t => rawTags.add(t));

        const normalizedTags = new Set();
        rawTags.forEach(t => {
            const n = normalizeTag(t);
            if (n) {
                normalizedTags.add(n);
                // Track display name (prefer title case or original if seen first)
                if (!tagToDisplay[n]) tagToDisplay[n] = t;
                else if (t[0] === t[0].toUpperCase() && tagToDisplay[n][0] !== tagToDisplay[n][0].toUpperCase()) {
                    tagToDisplay[n] = t;
                }
            }
        });

        normalizedTags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });

        return Array.from(normalizedTags);
    });

    const allTags = Object.keys(tagCounts).sort();
    const tagToIndex = Object.fromEntries(allTags.map((t, i) => [t, i]));
    const numTags = allTags.length;

    console.log(`🏷️  Found ${numTags} unique normalized tags.`);

    // 2. Build Co-occurrence Matrix (Sparse-ish)
    const coMatrix = Array.from({ length: numTags }, () => new Float32Array(numTags));

    songToTags.forEach(tags => {
        for (let i = 0; i < tags.length; i++) {
            const idxA = tagToIndex[tags[i]];
            for (let j = i + 1; j < tags.length; j++) {
                const idxB = tagToIndex[tags[j]];
                coMatrix[idxA][idxB]++;
                coMatrix[idxB][idxA]++;
            }
        }
    });

    // 3. Compute Similarity (Jaccard)
    // J(A,B) = count(A & B) / (count(A) + count(B) - count(A & B))
    const similarity = (i, j) => {
        const intersection = coMatrix[i][j];
        if (intersection === 0) return 0;
        const union = tagCounts[allTags[i]] + tagCounts[allTags[j]] - intersection;
        return intersection / union;
    };

    const graph = {
        version: "1.0.0",
        generated_at: new Date().toISOString(),
        tags: {}
    };

    allTags.forEach((tag, i) => {
        const scores = [];
        for (let j = 0; j < numTags; j++) {
            if (i === j) continue;
            const sim = similarity(i, j);
            if (sim > 0) {
                scores.push({
                    tag: allTags[j],
                    display: tagToDisplay[allTags[j]],
                    score: sim,
                    support: coMatrix[i][j]
                });
            }
        }

        // Direct Recommendations (Top 10)
        const direct = scores
            .sort((a, b) => b.score - a.score)
            .slice(0, 15);

        graph.tags[tag] = {
            tag: tag,
            display: tagToDisplay[tag],
            df: tagCounts[tag],
            direct: direct,
            tertiary: [] // To be computed
        };
    });

    // 4. Compute Tertiary Recommendations (2-hop)
    // score(u, w) = sum( sim(u, v) * sim(v, w) ) for all neighbors v of u
    allTags.forEach((tagU) => {
        const uData = graph.tags[tagU];
        const tertiaryMap = new Map();
        const directSet = new Set(uData.direct.map(v => v.tag));
        directSet.add(tagU);

        uData.direct.forEach(v => {
            const vData = graph.tags[v.tag];
            vData.direct.forEach(w => {
                if (directSet.has(w.tag)) return; // Skip self or direct neighbors

                const weight = v.score * w.score * 0.8; // Decay
                tertiaryMap.set(w.tag, (tertiaryMap.get(w.tag) || 0) + weight);
            });
        });

        uData.tertiary = Array.from(tertiaryMap.entries())
            .map(([tagW, score]) => ({
                tag: tagW,
                display: tagToDisplay[tagW],
                score: parseFloat(score.toFixed(4))
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 15);
    });

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(graph, null, 2));
    console.log(`✅ Graph generated at ${OUTPUT_PATH}`);

    // --- EVALUATION REPORT ---
    console.log("\n🧪 --- VIBE MATRIX EVALUATION REPORT ---");

    const tagsWithRecs = allTags.filter(t => graph.tags[t].direct.length >= 5);
    const coverage = (tagsWithRecs.length / allTags.length) * 100;
    console.log(`📊 Coverage: ${coverage.toFixed(2)}% of tags have >= 5 recommendations.`);

    const sampleTags = ['pop', 'rock', 'heavy metal', 'emotional', 'hiphop', 'electronic', 'folk', 'ambient', 'synthwave', 'cinematic'];
    console.log("\n🧠 Sanity Check (Top 10 Recs for Sample Tags):");
    sampleTags.forEach(t => {
        const data = graph.tags[t];
        if (data) {
            const recs = data.direct.slice(0, 10).map(r => r.display).join(", ");
            console.log(`- ${data.display}: ${recs}`);
        } else {
            console.log(`- ${t}: [Not Found]`);
        }
    });

    // Guardrails Check
    let duplicatesFound = 0;
    allTags.forEach(tag => {
        const seen = new Set([tag]);
        graph.tags[tag].direct.forEach(d => {
            if (seen.has(d.tag)) duplicatesFound++;
            seen.add(d.tag);
        });
    });
    console.log(`\n🛡️  Guardrails: ${duplicatesFound === 0 ? "PASSED" : "FAILED (" + duplicatesFound + " duplicates)"} (No self/duplicate tags in recs)`);
}

generate();
