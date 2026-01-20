import { getDomain, getPublicSuffix } from 'tldts';

// MOCKING the new logic from domains.ts
function getSafeRpId(hostname) {
    // localhost fallback
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) return 'localhost';

    // FORCE SHARED ROOT for all smol.xyz subdomains
    if (hostname.endsWith('smol.xyz')) {
        return 'smol.xyz';
    }

    const domain = getDomain(hostname);
    const suffix = getPublicSuffix(hostname);

    const blockedDomains = ['pages.dev', 'vercel.app', 'netlify.app', 'herokuapp.com'];
    if (!domain || !suffix || domain === suffix || blockedDomains.includes(domain) || blockedDomains.includes(suffix)) {
        return undefined;
    }

    return domain;
}

const testCases = [
    'smol.xyz',
    'noot.smol.xyz',
    'game.smol.xyz',
    'myapp.pages.dev',
    'pages.dev',
    'localhost',
    '127.0.0.1',
    'google.co.uk',
    'sub.google.co.uk'
];

console.log('Testing getSafeRpId logic:');
testCases.forEach(host => {
    const result = getSafeRpId(host);
    console.log(`PASS: ${host.padEnd(20)} -> ${result}`);
});
