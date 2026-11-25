/**
 * `<meta name="robots">` policy (PURE — used by Layout.astro and unit tests).
 *
 * - Only the production host `smol.xyz` is ever indexable; every other host
 *   (previews, localhost) is `noindex, nofollow` globally.
 * - On smol.xyz a page can opt out with `noindex` (e.g. a mixtape hidden from
 *   the Mixtapes page) or `noindex` + `nofollow` (a private / restricted song).
 */
import { songSafety, type SongNsfw } from './songSafety.ts';

export const PRODUCTION_HOST = 'smol.xyz';

export function robotsContent(input: { hostname: string; noindex?: boolean; nofollow?: boolean }): string {
  if (input.hostname !== PRODUCTION_HOST) return 'noindex, nofollow';
  if (input.noindex && input.nofollow) return 'noindex, nofollow';
  if (input.noindex) return 'noindex';
  return 'index, follow';
}

interface SongVisibilityInput {
  d1?: { Public?: number | null } | null;
  kv_do?: {
    /** Original generation payload: its `public` is stale once published (ignored). */
    payload?: unknown;
    nsfw?: SongNsfw | null;
  } | null;
}

/**
 * A song page may be indexed only when the API returned a PUBLISHED, public,
 * unrestricted song:
 * - CURRENT visibility is D1's `Public === 1`. Publishing / unpublishing
 *   updates D1 only (smol-workflow `PUT /smols/:id`), so the ORIGINAL
 *   generation `payload.public` is stale and deliberately ignored.
 * - Not restricted by the exact predicate the song page UI uses
 *   (`songSafety`): flagged unsafe OR safety unknown (`nsfw.unknown`, even
 *   with `safe` missing).
 * Missing data (404, auth-only response, still generating / unpublished) is
 * never indexable.
 */
export function isIndexableSong(data: SongVisibilityInput | null | undefined): boolean {
  if (!data?.d1) return false;
  if (data.d1.Public !== 1) return false;
  if (songSafety(data.kv_do?.nsfw).restricted) return false;
  return true;
}
