import fs from 'fs';
import path from 'path';

console.log('🚑 Running Repo Doctor...\n');

let issues = 0;

// 1. Check Node Version
const nodeVersion = process.version;
if (!nodeVersion.startsWith('v18') && !nodeVersion.startsWith('v20') && !nodeVersion.startsWith('v22')) {
    console.warn(`⚠️  Node version ${nodeVersion} detected. specific versions (18, 20, 22) are strictly recommended.`);
    // Not erroring, just warn
} else {
    console.log(`✅ Node Version: ${nodeVersion}`);
}

// 2. Check pnpm
const userAgent = process.env.npm_config_user_agent;
if (userAgent && !userAgent.startsWith('pnpm')) {
    console.warn('⚠️  You seem to be running this with something other than pnpm. We recommend pnpm.');
} else {
    console.log('✅ Package Manager: pnpm detected (or script run directly)');
}

// 3. Check .env
const envPath = path.join(process.cwd(), '.env');
const exampleEnvPath = path.join(process.cwd(), '.env.example'); // Assuming we might make one

if (fs.existsSync(envPath)) {
    console.log('✅ .env file exists');
    // Basic check for contents
    const content = fs.readFileSync(envPath, 'utf-8');
    const requiredVars = [
        'PUBLIC_RPC_URL',
        'PUBLIC_NETWORK_PASSPHRASE',
        'PUBLIC_API_URL'
    ];
    requiredVars.forEach(v => {
        if (!content.includes(v)) {
            console.error(`❌ Missing env var: ${v}`);
            issues++;
        }
    });
} else {
    console.error('❌ .env file NOT found! Copy .env.example or ask a maintainer.');
    issues++;
}

// 4. Check Ports (Informational)
console.log('ℹ️  Dev Server Port: Expecting 4321.');

if (issues > 0) {
    console.error(`\n❌ Doctor found ${issues} issues. Please fix them.`);
    process.exit(1);
} else {
    console.log('\n✅ System looks healthy! Ready to ship. 🚀');
}
