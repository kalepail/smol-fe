import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'docs');
const REPO_ROOT = process.cwd();

function getMarkdownFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            results = results.concat(getMarkdownFiles(filePath));
        } else if (file.endsWith('.md')) {
            results.push(filePath);
        }
    });
    return results;
}

function extractData(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');

    // Extract anchors (headings)
    // GitHub slugs headings: # My Heading -> #my-heading
    const headingMatches = content.match(/^#+\s+(.*)$/gm) || [];
    const anchors = headingMatches.map(h => {
        const title = h.replace(/^#+\s+/, '');
        return title.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-');
    });

    // Extract links
    const linkMatches = content.match(/\[.*?\]\((.*?)\)/g) || [];
    const links = linkMatches.map(l => {
        const match = l.match(/\[.*?\]\((.*?)\)/);
        return match ? match[1] : null;
    }).filter(Boolean);

    // Extract file references (absolute or relative paths)
    const fileRefMatches = content.match(/`([^`]+\.[a-z]{2,4})`/g) || [];
    const fileRefs = fileRefMatches.map(f => f.slice(1, -1));

    return {
        path: relativePath,
        anchors,
        links,
        fileRefs
    };
}

function main() {
    const files = getMarkdownFiles(REPO_ROOT).filter(f => !f.includes('node_modules'));
    const map = {};

    files.forEach(file => {
        const data = extractData(file);
        map[data.path] = data;
    });

    fs.writeFileSync(path.join(DOCS_DIR, 'XREF_MAP.json'), JSON.stringify(map, null, 2));
    console.log(`✅ Generated XREF_MAP.json with ${Object.keys(map).length} files.`);
}

main();
