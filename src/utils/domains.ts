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

/**
 * Calculates a safe domain for cookies.
 * 
 * 1. For smol.xyz subdomains, returns '.smol.xyz' to allow session sharing.
 * 2. For public suffixes (pages.dev, vercel.app), returns undefined (host-only cookie).
 * 3. Prevents collisions between dev and production environments.
 */
export function getSafeCookieDomain(hostname: string): string | undefined {
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) return undefined;

    const domain = getDomain(hostname);
    const suffix = getPublicSuffix(hostname);

    // Only allow shared cookies across smol.xyz subdomains
    if (domain === 'smol.xyz') {
        return '.smol.xyz';
    }

    // For everything else, or if domain logic fails, use host-only
    if (!domain || !suffix || domain === suffix) {
        return undefined;
    }

    // Default to registrable domain if not blocked (e.g. self-hosted domains)
    return `.${domain}`;
}
