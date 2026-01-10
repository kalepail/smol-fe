import type { Smol } from '../types/domain';

/**
 * Build radio URL from a Smol object.
 * Prefers tags when available, falls back to play by ID.
 */
export function buildRadioUrl(smol: Smol | { Id: string; Tags?: string[] }): string {
    if (!smol?.Id) return '/radio';

    // Prefer tags (up to 5 to keep URL reasonable)
    if (smol.Tags && smol.Tags.length > 0) {
        const tags = smol.Tags.slice(0, 5);
        const params = tags.map(t => `tag=${encodeURIComponent(t)}`).join('&');
        return `/radio?${params}`;
    }

    // Fallback to play by ID
    return `/radio?play=${encodeURIComponent(smol.Id)}`;
}
