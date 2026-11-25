export function getWebAuthnRpId(
  hostname = typeof window !== 'undefined' ? window.location.hostname : ''
): string | undefined {
  if (!hostname) return undefined;
  if (hostname === 'smol.xyz' || hostname.endsWith('.smol.xyz')) {
    return 'smol.xyz';
  }
  return hostname;
}

export function getAuthCookieDomain(
  hostname = typeof window !== 'undefined' ? window.location.hostname : ''
): string | undefined {
  if (hostname === 'smol.xyz' || hostname.endsWith('.smol.xyz')) {
    return '.smol.xyz';
  }
  return undefined;
}
