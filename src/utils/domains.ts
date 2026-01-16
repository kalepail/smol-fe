/**
 * Calculates a safe Relying Party ID (RP ID) for WebAuthn.
 * 
 * Update 2026-01-16: Reverted to returning undefined (browser default) to fix regressions.
 * Previously using tldts caused:
 * 1. 'pages.dev' SecurityError (PSL)
 * 2. 400 Bad Request on subdomains (noot.smol.xyz) due to backend expectation of Origin matching RP ID.
 * 
 * We return undefined to let the browser and server default to the full Origin/Hostname.
 */
export function getSafeRpId(hostname: string): string | undefined {
    return undefined;
}
