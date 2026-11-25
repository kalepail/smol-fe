/**
 * Frontend-only coaching helpers layered on the shared Tier 1 classifier.
 *
 * `mixtapeVisibility.ts` is a byte-identical mirror of
 * `smol-workflow/src/utils/mixtape-visibility.ts` (enforced by
 * tests/unit/mixtapeVisibility.test.ts), so every preview computed here makes
 * exactly the decision the live backend will make on save/publish (Tier 2
 * semantic verdicts aside — those only ever run server-side at write time).
 */
import {
  classifyOwnerMixtapes,
  dedupeOrdered,
  findBorderlinePair,
  MIN_LISTED_TRACKS,
  type MixtapeCandidate,
  type MixtapeDecision,
  type MixtapeHiddenReason,
} from './mixtapeVisibility.ts';

/** The minimum an owned mixtape needs to take part in a preview. */
export interface CohortMixtape {
  id: string;
  title: string;
  description: string;
  creator: string;
  createdAt: string;
  /** Ordered PUBLIC track ids (what GET /mixtapes/mine returns as `Smols`). */
  trackIds: string[];
  /** Stored track count incl. private/missing references, when known. */
  storedTrackCount?: number;
}

export interface DraftShape {
  title: string;
  description: string;
  /** Ordered track ids. Tracks known to be private (`public === 0`) must be excluded by the caller. */
  trackIds: string[];
}

export type PreviewChange =
  | { kind: 'create'; draft: DraftShape }
  | { kind: 'edit'; id: string; draft: DraftShape };

export interface PreviewImpact {
  id: string;
  title: string;
  visibility: 'public' | 'owner';
  hiddenReason: MixtapeHiddenReason | null;
}

export interface MixtapePreview {
  self: MixtapeDecision;
  /** The listed mixtape this one would match (duplicate/superseded/overlap/semantic), if any. */
  match: { id: string; title: string } | null;
  /** Other mixtapes of the owner whose listing would change because of this change. */
  newlyHidden: PreviewImpact[];
  newlyListed: PreviewImpact[];
  /**
   * Same-owner pair in the Tier 2 borderline band (e.g. same songs, new title).
   * Only the backend's write-time semantic check decides these, so the UI may
   * only give a soft heads-up.
   */
  borderline: { id: string; title: string; trigger: 'jaccard' | 'containment' | 'same_set_changed' } | null;
}

export const PREVIEW_DRAFT_ID = '__draft__';

/** A draft's createdAt in the backend's `CURRENT_TIMESTAMP` shape (always newest). */
function nowTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Stored-list fingerprint for an owned row: when some of its stored songs are no
 * longer public we only know HOW MANY, so we pad with opaque placeholders. This
 * mirrors the backend rule that an exact `duplicate` needs identical stored lists,
 * so a row hiding private songs can never be called an exact retry of a draft.
 */
export function storedTracksFor(row: CohortMixtape): string[] {
  const missing = Math.max(0, (row.storedTrackCount ?? row.trackIds.length) - row.trackIds.length);
  if (missing === 0) return row.trackIds;
  return [...row.trackIds, ...Array.from({ length: missing }, (_, i) => `\u0000private:${row.id}:${i}`)];
}

export function cohortCandidate(row: CohortMixtape): MixtapeCandidate {
  return {
    id: row.id,
    address: row.creator,
    title: row.title,
    desc: row.description ?? '',
    createdAt: row.createdAt,
    publicTracks: row.trackIds,
    storedTracks: storedTracksFor(row),
  };
}

function sameDecision(a: MixtapeDecision | undefined, b: MixtapeDecision | undefined): boolean {
  return a?.visibility === b?.visibility && a?.hiddenReason === b?.hiddenReason;
}

/**
 * Preview what the backend's Tier 1 rubric will decide for a draft (create) or
 * an edited mixtape, and which of the owner's other mixtapes change listing.
 * `mine` must be ONE owner's non-deleted mixtapes (GET /mixtapes/mine).
 */
export function previewMixtapeChange(
  mine: readonly CohortMixtape[],
  owner: string,
  change: PreviewChange,
  now: string = nowTimestamp()
): MixtapePreview {
  const rows = mine.filter((row) => row.creator === owner);
  const before = classifyOwnerMixtapes(rows.map(cohortCandidate));

  const trackIds = dedupeOrdered(change.draft.trackIds);
  const existing = change.kind === 'edit' ? rows.find((row) => row.id === change.id) : undefined;
  const subjectId = change.kind === 'edit' ? change.id : PREVIEW_DRAFT_ID;
  const subject: MixtapeCandidate = {
    id: subjectId,
    address: owner,
    title: change.draft.title,
    desc: change.draft.description ?? '',
    createdAt: existing?.createdAt ?? now,
    publicTracks: trackIds,
    storedTracks: trackIds,
  };

  const hypothetical = [...rows.filter((row) => row.id !== subjectId).map(cohortCandidate), subject];
  const after = classifyOwnerMixtapes(hypothetical);
  const self = after.get(subjectId)!;
  const titleOf = (id: string | null) => (id ? hypothetical.find((row) => row.id === id)?.title ?? '' : '');

  const newlyHidden: PreviewImpact[] = [];
  const newlyListed: PreviewImpact[] = [];
  for (const row of rows) {
    if (row.id === subjectId) continue;
    const prev = before.get(row.id);
    const next = after.get(row.id);
    if (!next || sameDecision(prev, next)) continue;
    const impact = { id: row.id, title: row.title, visibility: next.visibility, hiddenReason: next.hiddenReason };
    if (next.visibility === 'owner' && prev?.visibility === 'public') newlyHidden.push(impact);
    else if (next.visibility === 'public' && prev?.visibility !== 'public') newlyListed.push(impact);
  }

  const pair = self.visibility === 'public' ? findBorderlinePair(hypothetical, after, subjectId) : null;
  const peer = pair ? (pair.a.id === subjectId ? pair.b : pair.a) : null;

  return {
    self,
    match: self.relatedId ? { id: self.relatedId, title: titleOf(self.relatedId) } : null,
    newlyHidden,
    newlyListed,
    borderline: pair && peer ? { id: peer.id, title: peer.title, trigger: pair.trigger } : null,
  };
}

export const MATCH_REASONS: ReadonlySet<MixtapeHiddenReason> = new Set([
  'duplicate',
  'superseded',
  'overlap',
  'semantic_duplicate',
]);

export function isMatchReason(reason: MixtapeHiddenReason | string | null | undefined): boolean {
  return Boolean(reason && MATCH_REASONS.has(reason as MixtapeHiddenReason));
}

/** Short, plain reason label for owner cards and chips (never color-only). */
export function hiddenReasonLabel(reason: string | null | undefined, relatedTitle?: string | null): string {
  const other = relatedTitle ? `"${relatedTitle}"` : 'another mixtape';
  switch (reason) {
    case 'empty':
      return 'No public songs';
    case 'duplicate':
      return `Same songs as ${other}`;
    case 'superseded':
      return `Already in ${other}`;
    case 'overlap':
      return `Similar to ${other}`;
    case 'semantic_duplicate':
      return `Another version of ${other}`;
    case 'too_few':
      return `Needs ${MIN_LISTED_TRACKS - 1} more song`;
    default:
      return 'Hidden from the Mixtapes page';
  }
}

/** One-sentence WHY for the owner callout (the backend `Advice` carries the fix). */
export function hiddenReasonHeadline(reason: string | null | undefined, relatedTitle?: string | null, total = 0): string {
  const other = relatedTitle ? `"${relatedTitle}"` : 'another of your mixtapes';
  const songs = `${total} ${total === 1 ? 'song' : 'songs'}`;
  switch (reason) {
    case 'empty':
      return 'None of the songs in this mixtape are public right now.';
    case 'duplicate':
      return `It has the same songs as your mixtape ${other}, so only ${other} shows on the Mixtapes page.`;
    case 'superseded':
      return `Every song here is also in your bigger mixtape ${other}.`;
    case 'overlap':
      return `Most of its songs are also in your mixtape ${other}.`;
    case 'semantic_duplicate':
      return `It looks like another version of your mixtape ${other}.`;
    case 'too_few':
      return `Mixtapes need at least ${MIN_LISTED_TRACKS} songs to show on the Mixtapes page. This one has ${songs}.`;
    default:
      return 'Only you can see why it is hidden.';
  }
}

/** Songs a merge of `sourceIds` into `targetIds` would append (source order), and the resulting total. */
export function mergePreview(sourceIds: readonly string[], targetIds: readonly string[]): { added: string[]; total: number; already: number } {
  const target = new Set(targetIds);
  const source = dedupeOrdered(sourceIds);
  const added = source.filter((id) => !target.has(id));
  return { added, total: target.size + added.length, already: source.length - added.length };
}
