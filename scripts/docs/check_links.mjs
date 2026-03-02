import fs from 'fs';
import path from 'path';

const XREF_PATH = path.join(process.cwd(), 'docs', 'XREF_MAP.json');
const REPO_ROOT = process.cwd();

if (!fs.existsSync(XREF_PATH)) {
    console.error('❌ XREF_MAP.json not found. Run docs:xref first.');
    process.exit(1);
}

const map = JSON.parse(fs.readFileSync(XREF_PATH, 'utf-8'));
let errors = 0;

function validateLink(sourcePath, link) {
    if (link.startsWith('http') || link.startsWith('mailto:')) return;

    const [targetRelative, anchor] = link.split('#');
    let targetPath;

    if (targetRelative === '') {
        // Self-link to anchor
        targetPath = sourcePath;
    } else {
        // Resolve target path relative to source file directory
        const sourceDir = path.dirname(path.join(REPO_ROOT, sourcePath));
        const absoluteTarget = path.resolve(sourceDir, targetRelative);
        targetPath = path.relative(REPO_ROOT, absoluteTarget).replace(/\\/g, '/');
    }

    // Check file existence
    if (!map[targetPath] && !fs.existsSync(path.join(REPO_ROOT, targetPath))) {
        console.error(`❌ Broken Link in ${sourcePath}: ${link} (File not found: ${targetPath})`);
        errors++;
        return;
    }

    // Check anchor existence if applicable
    if (anchor && map[targetPath]) {
        if (!map[targetPath].anchors.includes(anchor)) {
            console.error(`❌ Broken Anchor in ${sourcePath}: ${link} (Anchor #${anchor} not found in ${targetPath})`);
            errors++;
        }
    }
}

function main() {
    Object.keys(map).forEach(sourcePath => {
        const { links, fileRefs } = map[sourcePath];

        links.forEach(link => validateLink(sourcePath, link));

        fileRefs.forEach(ref => {
            // Simple check for referenced files
            if (ref.startsWith('src/') || ref.startsWith('public/') || ref.startsWith('scripts/')) {
                if (!fs.existsSync(path.join(REPO_ROOT, ref))) {
                    console.warn(`⚠️  Stale File Reference in ${sourcePath}: ${ref}`);
                }
            }
        });
    });

    if (errors > 0) {
        console.error(`\n❌ Failed with ${errors} link/anchor errors.`);
        process.exit(1);
    } else {
        console.log('\n✅ Link and Anchor check passed.');
    }
}

main();
