import { getDomain, getPublicSuffix } from 'tldts';

/**
 * Calculates a safe Relying Party ID (RP ID) for WebAuthn.
 * 
 * Logic:
 * 1. Use `tldts` to get the registrable domain (e.g. "smol.xyz" from "noot.smol.xyz").
 * 2. If the domain is the same as the public suffix (e.g. "pages.dev"), it's invalid as an RP ID.
 *    Return undefined to let the browser default to the Origin (e.g. "foo.pages.dev").
 * 3. Otherwise, return the domain (allows subdomain passkey sharing).
 */
export function getSafeRpId(hostname: string): string | undefined {
    // localhost fallback
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) return 'localhost';

    // FORCE SHARED ROOT for all smol.xyz subdomains (e.g. "noot.smol.xyz" -> "smol.xyz")
    // This ensures that passkeys created on any subdomain can be used on any other subdomain (or root).
    if (hostname.endsWith('smol.xyz')) {
        return 'smol.xyz';
    }

    const domain = getDomain(hostname);
    const suffix = getPublicSuffix(hostname);

    // If domain logic fails or it matches the suffix (e.g. co.uk), use Origin
    // CRITICAL FIX: For shared hosting providers (pages.dev, vercel.app), tldts might return the public suffix as the domain.
    // We must explicitly return the FULL HOSTNAME for these to ensure a valid unique RP ID.
    const blockedSuffixes = ['pages.dev', 'vercel.app', 'netlify.app', 'herokuapp.com'];
    if (blockedSuffixes.some(s => hostname.endsWith(s))) {
        return hostname;
    }

    if (!domain || !suffix || domain === suffix) {
        return undefined;
    }

    return domain;
}
