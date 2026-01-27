import fs from 'fs';
import path from 'path';

const XREF_PATH = path.join(process.cwd(), 'docs', 'XREF_MAP.json');
const REPO_ROOT = process.cwd();

if (!fs.existsSync(XREF_PATH)) {
    console.error('❌ Missing XREF_MAP.json');
    process.exit(1);
}

const map = JSON.parse(fs.readFileSync(XREF_PATH, 'utf-8'));
let errors = 0;

// Search for contradictions across all docs
// e.g. "port 3000" vs "port 4321" (though check_claims handles some of this)
// Here we look for cross-doc inconsistencies in terminology or feature names.

const terms = [
    { canonical: 'Auth Token', legacy: 'JWT' },
    { canonical: 'GalacticSnapshot', legacy: 'universal-smols' },
    { canonical: 'universal-snapshot.js', legacy: 'update-snapshot.js' }
];

function main() {
    Object.keys(map).forEach(filePath => {
        const content = fs.readFileSync(path.join(REPO_ROOT, filePath), 'utf-8');

        terms.forEach(({ canonical, legacy }) => {
            if (content.includes(legacy)) {
                console.error(`❌ Consistency Failure in ${filePath}: Found legacy term "${legacy}", use canonical "${canonical}"`);
                errors++;
            }
        });
    });

    if (errors > 0) {
        console.error(`\n❌ Failed with ${errors} consistency errors.`);
        process.exit(1);
    } else {
        console.log('\n✅ Consistency check passed.');
    }
}

main();
