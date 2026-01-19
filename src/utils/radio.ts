import type { Smol } from '../types/domain';

/**
 * Build radio URL from a Smol object.
 * Prefers tags when available, falls back to play by ID.
 */
export function buildRadioUrl(smol: Smol | { Id: string; Tags?: string[]; lyrics?: { style?: string[] } }): string {
    if (!smol?.Id) return '/radio';

    const tags: string[] = [];
    if (smol.Tags) tags.push(...smol.Tags);
    if ('lyrics' in smol && smol.lyrics?.style) tags.push(...smol.lyrics.style);

    const uniqueTags = [...new Set(tags.map(t => t.trim()).filter(t => t.length > 0))].slice(0, 5);
    const params = new URLSearchParams();

    params.set('play', smol.Id);
    uniqueTags.forEach(t => params.append('tag', t));

    return `/radio?${params.toString()}`;
}
