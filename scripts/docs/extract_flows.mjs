import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.cwd();
const DIAGRAMS_DIR = path.join(REPO_ROOT, 'docs', 'diagrams');

if (!fs.existsSync(DIAGRAMS_DIR)) {
    fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });
}

function extractFlows(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Look for Mermaid blocks describing stateDiagram-v2
    const mermaidBlocks = content.match(/```mermaid\s+stateDiagram-v2[\s\S]*?```/g) || [];

    return mermaidBlocks.map(block => {
        return {
            source: path.relative(REPO_ROOT, filePath).replace(/\\/g, '/'),
            content: block
        };
    });
}

function main() {
    const docs = fs.readdirSync(path.join(REPO_ROOT, 'docs'))
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(REPO_ROOT, 'docs', f));

    const flows = [];
    docs.forEach(doc => {
        flows.push(...extractFlows(doc));
    });

    fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'FLOW_SPECS.json'), JSON.stringify(flows, null, 2));
    console.log(`✅ Extracted ${flows.length} flows into FLOW_SPECS.json`);
}

main();
