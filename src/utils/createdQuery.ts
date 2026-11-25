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

/** `history.state` key naming the account a filtered `/created?q=` entry belongs to. */
export const CREATED_QUERY_OWNER_KEY = 'createdQueryOwner';

type HistoryState = Record<string, unknown>;

/**
 * `state` (Astro ClientRouter's `{ index, scrollX, scrollY }`, kept intact) with the filter's
 * owning account stamped, or the stamp removed when there is no owner / no query.
 */
export function stampCreatedQueryOwner(state: unknown, owner: string | null): HistoryState {
  const next: HistoryState = state && typeof state === 'object' ? { ...(state as HistoryState) } : {};
  if (owner) next[CREATED_QUERY_OWNER_KEY] = owner;
  else delete next[CREATED_QUERY_OWNER_KEY];
  return next;
}

/**
 * True when a history entry's `?q=` was typed by another account (or the viewer has since
 * signed out), e.g. Back to `/created?q=…` after switching accounts on another page.
 * An unstamped entry (a fresh external deep link) is never foreign.
 */
export function isForeignCreatedQuery(state: unknown, account: string | null): boolean {
  const owner = state && typeof state === 'object' ? (state as HistoryState)[CREATED_QUERY_OWNER_KEY] : undefined;
  return typeof owner === 'string' && owner !== account;
}
