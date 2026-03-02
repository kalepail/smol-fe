import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'docs');
const INDEX_FILE = path.join(DOCS_DIR, 'INDEX.md');

function checkDocs() {
    console.log('🔍 Checking documentation integrity...');

    if (!fs.existsSync(INDEX_FILE)) {
        console.error('❌ docs/INDEX.md not found!');
        process.exit(1);
    }

    const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
    const links = Array.from(
        indexContent.matchAll(/\[[^\]]+\]\(([^)]+)\)/g),
        (match) => match[1].trim(),
    );
    const normalizedLinks = links
        .map((link) => link.split('#')[0].split('?')[0].trim())
        .filter(Boolean);

    let errors = 0;

    console.log(`📝 Found ${normalizedLinks.length} links in INDEX.md`);

    // 1. Check if linked files exist
    normalizedLinks.forEach(link => {
        // Skip external and non-file links
        if (
            link.startsWith('http') ||
            link.startsWith('#') ||
            link.startsWith('mailto:')
        ) {
            return;
        }

        const filePath = path.join(DOCS_DIR, link);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Broken link in INDEX.md: ${link}`);
            errors++;
        }
    });

    // 2. Check for orphan files (files in docs/ but not in INDEX.md)
    // Recursively get all .md files in docs/
    function getFiles(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                // Skip archive and ai folders for now if you want, or include them
                if (file !== 'archive' && file !== 'ai') {
                    results = results.concat(getFiles(filePath));
                }
            } else {
                if (file.endsWith('.md') && file !== 'INDEX.md') {
                    results.push(path.relative(DOCS_DIR, filePath).replace(/\\/g, '/'));
                }
            }
        });
        return results;
    }

    const files = getFiles(DOCS_DIR);
    files.forEach(file => {
        if (!normalizedLinks.includes(file)) {
            console.warn(`⚠️  Orphan file (not linked in INDEX.md): ${file}`);
            // Don't fail checking for optimization, just warn
        }
    });

    if (errors > 0) {
        console.error(`\n❌ Found ${errors} errors.`);
        process.exit(1);
    } else {
        console.log('\n✅ Documentation index is healthy!');
    }
}

checkDocs();
