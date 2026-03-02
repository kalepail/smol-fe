import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const historyPath = path.join(__dirname, '../pr_history.json');
const outputPath = 'C:\\Users\\Jeff\\.gemini\\antigravity\\brain\\35f969f1-678e-44b5-8c07-ab2d0b205d7b\\pr_timeline.md';

const prs = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

// Sort 1 to 43 (Oldest First)
prs.sort((a, b) => a.number - b.number);

let md = `# Full PR History: Smol-FE (1-43)\n\n`;
md += `> **Tip:** This document is long. Use your markdown viewer's specific Zoom or standard Scroll to navigate.\n\n`;

// 1. ASCII Timeline
md += `## 1. ASCII Timeline (Scrollable)\n\`\`\`text\n`;
prs.forEach(pr => {
    const status = pr.merged_at ? "[MERGED]" : (pr.state === 'closed' ? "[CLOSED]" : "[OPEN]");
    const date = pr.merged_at ? pr.merged_at.split('T')[0] : 'Thinking...';

    // Formatting
    const header = `PR #${pr.number}`.padEnd(8);
    const stateStr = status.padEnd(10);
    const dateStr = date.padEnd(12);
    const branchInfo = `${pr.head} -> ${pr.base}`;

    md += `${header} | ${stateStr} | ${dateStr} | ${pr.title}\n`;
    md += `         |            |              | (${branchInfo})\n`;
    md += `         |\n`;
});
md += `         v\n         (End of History)\n\`\`\`\n\n`;

// 2. Mermaid Diagram
md += `## 2. Mermaid State Diagram (Visual)\n`;
md += `\`\`\`mermaid\nstateDiagram-v2\n    direction TB\n\n`;

prs.forEach((pr, index) => {
    const nodeId = `PR${pr.number}`;
    const desc = `#${pr.number} ${pr.title.replace(/["':()]/g, '')}`;

    md += `    state "${desc}" as ${nodeId}\n`;
    md += `    ${nodeId} : Status: ${pr.state}\n`;

    if (index > 0) {
        const prevId = `PR${prs[index - 1].number}`;
        md += `    ${prevId} --> ${nodeId}\n`;
    }
});

md += `\`\`\`\n`;

fs.writeFileSync(outputPath, md);
console.log('Timeline generated at ' + outputPath);
