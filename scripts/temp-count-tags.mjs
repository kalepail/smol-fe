import fs from 'fs';

const data = JSON.parse(fs.readFileSync('public/data/GalacticSnapshot.json', 'utf8'));

const tagCounts = {};

data.forEach(smol => {
    const tags = new Set();
    if (smol.Tags) smol.Tags.forEach(t => tags.add(t));
    if (smol.lyrics?.style) smol.lyrics.style.forEach(t => tags.add(t));

    tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
});

const popularTags = Object.entries(tagCounts)
    .filter(([tag, count]) => count > 5)
    .sort((a, b) => b[1] - a[1]);

console.log(JSON.stringify(popularTags, null, 2));
