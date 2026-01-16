
import fs from 'fs';
import path from 'path';

export class ArtifactWriter {
    private baseDir: string;

    constructor(baseDir: string = './artifacts/audit') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.baseDir = path.join(baseDir, timestamp);
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
        console.log(`📂 Audit Artifacts: ${this.baseDir}`);
    }

    write(filename: string, content: any) {
        const filePath = path.join(this.baseDir, filename);
        let data = content;
        if (typeof content !== 'string') {
            data = JSON.stringify(content, null, 2);
        }
        fs.writeFileSync(filePath, data);
        console.log(`   📝 Wrote: ${filename}`);
    }

    getPath(filename: string) {
        return path.join(this.baseDir, filename);
    }
}
