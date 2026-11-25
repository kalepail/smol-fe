/**
 * `/created?q=` owner title filter (PURE — used by CreatedSongs.svelte and unit tests).
 *
 * smol-workflow `GET /created?q=` matches a case-insensitive title substring on the
 * signed-in owner's songs (private and public) and accepts at most 100 characters.
 */
export const CREATED_QUERY_MAX = 100;

/** Raw input value from a URL search string, clamped to the API's max length. */
export function readCreatedQuery(search: string): string {
  return (new URLSearchParams(search).get('q') ?? '').slice(0, CREATED_QUERY_MAX);
}

/** The query actually sent to the API (`''` = no filter). */
export function activeCreatedQuery(input: string): string {
  return input.slice(0, CREATED_QUERY_MAX).trim();
}

/** `href` with `?q=` set to `query`, or dropped when `query` is empty. Other params and the hash are kept. */
export function withCreatedQuery(href: string, query: string): string {
  const url = new URL(href);
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  return url.toString();
}
