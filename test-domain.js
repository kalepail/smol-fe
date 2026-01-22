import { getDomain, getPublicSuffix } from 'tldts';

function getSafeRpId(hostname) {
    if (hostname === 'localhost') return 'localhost';
    const domain = getDomain(hostname);
    const suffix = getPublicSuffix(hostname);
    const blockedDomains = ['pages.dev', 'vercel.app', 'netlify.app', 'herokuapp.com'];

    if (!domain || !suffix || domain === suffix || blockedDomains.includes(domain) || blockedDomains.includes(suffix)) {
        return undefined;
    }
    return domain;
}

console.log("Testing RP ID logic:");
console.log("Input: noot.smol.xyz");
console.log("Output: ", getSafeRpId("noot.smol.xyz"));
