import fs from 'fs';
import path from 'path';

const XREF_PATH = path.join(process.cwd(), 'docs', 'XREF_MAP.json');
const SOW_PATH = path.join(process.cwd(), 'docs', 'STATE_OF_WORLD.md');
const REPO_ROOT = process.cwd();

if (!fs.existsSync(XREF_PATH) || !fs.existsSync(SOW_PATH)) {
    console.error('❌ Missing XREF_MAP.json or STATE_OF_WORLD.md.');
    process.exit(1);
}

const map = JSON.parse(fs.readFileSync(XREF_PATH, 'utf-8'));
const sow = fs.readFileSync(SOW_PATH, 'utf-8');

// Extract facts from STATE_OF_WORLD
const port = sow.match(/\*\*Dev Port\*\*\s*\|\s*`(\d+)`/)?.[1];
const prodUrl = sow.match(/\*\*Prod URL\*\*\s*\|\s*`(https:\/\/.*?)`/)?.[1];
const devUrl = sow.match(/\*\*Dev URL\*\*\s*\|\s*`(https:\/\/.*?)`/)?.[1];
const apiUrl = sow.match(/\*\*API URL\*\*\s*\|\s*`(https:\/\/.*?)`/)?.[1];
const pnpmVersion = sow.match(/\*\*pnpm Version\*\*\s*\|\s*`(\d+.*?|pnpm.*?)`/)?.[1];

console.log(`📡 SSOT Facts: Port=${port}, API=${apiUrl}, pnpm=${pnpmVersion}`);

let errors = 0;

function checkClaims(filePath, data) {
    const lines = fs.readFileSync(path.join(REPO_ROOT, filePath), 'utf-8').split('\n');
    const content = lines.join('\n');

    // 1. Port check
    lines.forEach((line, idx) => {
        const portsFound = line.match(/localhost:(\d+)/g) || [];
        portsFound.forEach(p => {
            const pNum = p.split(':')[1];
            if (pNum !== port) {
                console.error(`❌ Claim Mismatch in ${filePath}:${idx + 1}: Found port ${pNum}, expected ${port} (SSOT) -> "${line.trim()}"`);
                errors++;
            }
        });
    });

    // 2. API URL check (check for legacy workers.dev)
    lines.forEach((line, idx) => {
        if (line.includes('smol-be.kalepail.workers.dev')) {
            console.error(`❌ Legacy Reference in ${filePath}:${idx + 1}: Found legacy workers URL -> "${line.trim()}"`);
            errors++;
        }
    });

    // 3. pnpm vs npm check
    lines.forEach((line, idx) => {
        if ((line.includes('npm install') || line.includes('npm run ')) && !line.includes('pnpm') && !line.includes('npmjs.com')) {
            if (!filePath.includes('node_modules') && !filePath.includes('scripts/')) {
                console.warn(`⚠️  Package Manager Inconsistency in ${filePath}:${idx + 1}: Found 'npm', project uses 'pnpm' -> "${line.trim()}"`);
            }
        }
    });

    // 4. File path existence in code blocks or inline code
    lines.forEach((line, idx) => {
        const paths = line.match(/`([^`]+\/[^`]+)`/g) || [];
        paths.forEach(p => {
            const cleanPath = p.slice(1, -1).split('#')[0].split(':')[0].trim();
            // Ignore placeholders like <ExperimentName> or example paths
            if (cleanPath.includes('<') || cleanPath.includes('>') || cleanPath.includes('example') || cleanPath.includes('my-page')) {
                return;
            }

            if ((cleanPath.startsWith('src/') || cleanPath.startsWith('docs/') || cleanPath.startsWith('scripts/')) && !cleanPath.includes('*')) {
                if (!fs.existsSync(path.join(REPO_ROOT, cleanPath))) {
                    console.error(`❌ Broken Path Claim in ${filePath}:${idx + 1}: ${cleanPath} does not exist -> "${line.trim()}"`);
                    errors++;
                }
            }
        });
    });
}

function main() {
    Object.keys(map).forEach(filePath => {
        checkClaims(filePath, map[filePath]);
    });

    if (errors > 0) {
        console.error(`\n❌ Failed with ${errors} claim errors.`);
        process.exit(1);
    } else {
        console.log('\n✅ Claim verification passed.');
    }
}

main();
