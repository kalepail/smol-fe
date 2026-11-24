/**
 * Song safety classification (PURE). The ONE predicate behind both the song
 * page UI (SmolDisplay / SongDetailsPanel badges and restrictions) and the
 * `<meta name="robots">` policy, so they can never disagree:
 *
 * - `unknown`: the safety check could not decide (`nsfw.unknown`), whatever
 *   `safe` says (it is often missing).
 * - `unsafe`: positively flagged (`safe === false`) and not `unknown`.
 * - `restricted`: either of the above. A song with no `nsfw` record at all is
 *   not restricted (legacy rows predate the check).
 */
export interface SongNsfw {
  safe?: boolean | null;
  unknown?: boolean | null;
}

export function songSafety(nsfw: SongNsfw | null | undefined): {
  unknown: boolean;
  unsafe: boolean;
  restricted: boolean;
} {
  const unknown = Boolean(nsfw?.unknown);
  const unsafe = Boolean(nsfw && nsfw.safe === false && !nsfw.unknown);
  return { unknown, unsafe, restricted: unknown || unsafe };
}
