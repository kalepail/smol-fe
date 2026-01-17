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
    if (hostname === 'localhost') return 'localhost';

    const domain = getDomain(hostname);
    const suffix = getPublicSuffix(hostname);

    // If domain logic fails or it matches the suffix (e.g. pages.dev), use Origin
    if (!domain || !suffix || domain === suffix) {
        return undefined;
    }

    return domain;
}
