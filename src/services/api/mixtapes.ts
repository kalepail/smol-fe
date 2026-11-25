import type { MixtapeDraft } from '../../types/domain';
import { ApiError, fetchWithTimeout, LONG_TIMEOUT, throwIfNotOk } from './fetch';
import { parseRetryAfter } from '../../utils/httpRetry';

/**
 * `pending`  — 503 create_pending: the same publish is still finishing; retry after `retryAfterMs`.
 * `conflict` — 409 create_conflict: the row changed/was removed mid-create; review `conflictId` if present.
 */
export type MixtapePublishErrorKind = 'auth' | 'network' | 'invalid_response' | 'server' | 'pending' | 'conflict';

export class MixtapePublishError extends Error {
  readonly kind: MixtapePublishErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly retryAfterMs?: number;
  readonly conflictId?: string;

  constructor(
    message: string,
    kind: MixtapePublishErrorKind,
    status?: number,
    extra: { code?: string; retryAfterMs?: number; conflictId?: string } = {}
  ) {
    super(message);
    this.name = 'MixtapePublishError';
    this.kind = kind;
    this.status = status;
    this.code = extra.code;
    this.retryAfterMs = extra.retryAfterMs;
    this.conflictId = extra.conflictId;
  }
}

export interface MixtapeSummary {
  id: string;
  title: string;
  description: string;
  creator: string;
  trackCount: number;
  coverUrls: (string | null)[];
  updatedAt: string;
}

export interface MixtapeSmolData {
  Id: string;
  Title: string;
  Address: string;
  Mint_Token?: string;
  Mint_Amm?: string;
  Song_1?: string;
  Public?: number;
  Tags?: string[];
}

export type MixtapeVisibilityState = 'public' | 'owner';

/**
 * Owner-facing lifecycle fields the live API attaches to GET /mixtapes/:id and
 * GET /mixtapes/mine (smol-workflow `ownerView`). All optional so older
 * payloads and SSR seeds stay valid.
 */
export interface MixtapeLifecycleFields {
  createdAt?: string;
  visibility?: MixtapeVisibilityState;
  hiddenReason?: string | null;
  relatedMixtapeId?: string | null;
  relatedMixtapeTitle?: string | null;
  uniquenessScore?: number | null;
  advice?: string | null;
  revision?: number;
  storedTrackCount?: number;
  publicTrackCount?: number;
}

export interface MixtapeDetail extends MixtapeSummary, MixtapeLifecycleFields {
  tracks: MixtapeSmolData[];
  creator: string;
}

/** One row of GET /mixtapes/mine: every non-deleted mixtape of the signed-in owner. */
export interface OwnedMixtape extends MixtapeSummary, MixtapeLifecycleFields {
  createdAt: string;
  /** Ordered PUBLIC track ids. */
  trackIds: string[];
  visibility: MixtapeVisibilityState;
  hiddenReason: string | null;
  relatedMixtapeId: string | null;
  relatedMixtapeTitle: string | null;
  advice: string | null;
  revision: number;
  storedTrackCount: number;
  publicTrackCount: number;
}

export interface ApiMixtape {
  Id: string;
  Title: string;
  Desc: string;
  Smols: string[];
  Address: string;
  Created_At: string;
  Updated_At?: string;
}

interface ApiLifecycleFields {
  Updated_At?: string;
  Visibility?: 'public' | 'owner' | 'deleted';
  Hidden_Reason?: string | null;
  Related_Mixtape_Id?: string | null;
  Related_Mixtape_Title?: string | null;
  Uniqueness_Score?: number | null;
  Advice?: string | null;
  Revision?: number;
  Stored_Track_Count?: number;
  Public_Track_Count?: number;
}

export interface ApiOwnedMixtape extends ApiMixtape, ApiLifecycleFields {}

export interface ApiMixtapeDetail extends ApiLifecycleFields {
  Id: string;
  Title: string;
  Desc: string;
  Address: string;
  Created_At: string;
  Smols: MixtapeSmolData[];
}

/** Write receipt returned by POST/PUT/restore (smol-workflow `writeReceipt`). */
export interface MixtapeWriteReceipt {
  id: string;
  visibility: MixtapeVisibilityState;
  hiddenReason: string | null;
  relatedMixtapeId: string | null;
  relatedMixtapeTitle: string | null;
  advice: string | null;
  uniquenessScore: number | null;
  revision: number;
  updatedAt: string;
  deduplicated?: boolean;
}

export interface MixtapeUpdatePayload {
  title: string;
  /** B-26: empty description is valid. */
  description: string;
  smols: string[];
  expectedRevision?: number;
}

export interface MixtapeMergeResult {
  targetId: string;
  mergedId: string;
  addedCount: number;
  totalTracks: number;
  target: OwnedMixtape | null;
  /** BE: the merge committed, but the target was deleted right afterwards (no target to open). */
  targetDeletedConcurrently: boolean;
}

export interface MixtapeUniquenessResult {
  willBeListed: boolean;
  visibility: MixtapeVisibilityState;
  hiddenReason: string | null;
  matchedMixtape: { id: string; title: string | null } | null;
  advice: string | null;
  uniquenessScore: number | null;
  isBorderline: boolean;
  borderlineMixtape: { id: string; title: string } | null;
  impacts: Array<{ id: string; title: string; visibility: MixtapeVisibilityState; hiddenReason: string | null }>;
}

export type MixtapeActionErrorKind =
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'merged'
  | 'revision_conflict'
  | 'merge_unavailable_tracks'
  | 'too_many_tracks'
  | 'invalid'
  | 'network'
  | 'server';

/**
 * Structured lifecycle error. `message` is always friendly UI copy — raw
 * transport text never reaches the UI (19 B-13).
 */
export class MixtapeActionError extends Error {
  readonly kind: MixtapeActionErrorKind;
  readonly status?: number;
  readonly code?: string;
  /** 409 revision_conflict: the latest server copy (owner view). */
  readonly current?: OwnedMixtape | null;
  readonly mergedInto?: string | null;
  readonly unavailableCount?: number;

  constructor(
    message: string,
    kind: MixtapeActionErrorKind,
    extra: { status?: number; code?: string; current?: OwnedMixtape | null; mergedInto?: string | null; unavailableCount?: number } = {}
  ) {
    super(message);
    this.name = 'MixtapeActionError';
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code;
    this.current = extra.current;
    this.mergedInto = extra.mergedInto;
    this.unavailableCount = extra.unavailableCount;
  }
}

export const MAX_MIXTAPE_TRACKS = 100;

const API_URL = import.meta.env.PUBLIC_API_URL!;

export async function publishMixtape(
  draft: MixtapeDraft
): Promise<{ id: string } & Partial<MixtapeWriteReceipt>> {
  const endpoint = `${API_URL}/mixtapes`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        title: draft.title.trim() || 'Untitled mixtape',
        // B-26: the description is optional; an empty one is sent as ''.
        desc: draft.description.trim() ? draft.description : '',
        smols: draft.tracks.map((track) => track.id),
      }),
      timeout: LONG_TIMEOUT,
    });
  } catch {
    throw new MixtapePublishError(
      'Couldn’t reach SMOL. Your draft is safe — check your connection and try again.',
      'network'
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new MixtapePublishError(
      'Your session expired. Sign in again to publish — your draft is safe.',
      'auth',
      response.status
    );
  }

  if (response.status === 503 || response.status === 409) {
    const text = await response.text().catch(() => '');
    let body: { code?: unknown; id?: unknown } | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (body?.code === 'create_pending') {
      throw new MixtapePublishError(
        'SMOL is still finishing your last publish. Try again in a second — your draft is safe.',
        'pending',
        response.status,
        { code: 'create_pending', retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')) }
      );
    }
    if (body?.code === 'create_conflict') {
      const conflictId = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : undefined;
      throw new MixtapePublishError(
        conflictId
          ? 'This mixtape changed while it was being published. Review it before publishing again — your draft is safe.'
          : 'This mixtape changed or was removed while it was being published. Your draft is safe — publish it again when you’re ready.',
        'conflict',
        response.status,
        { code: 'create_conflict', conflictId }
      );
    }
    throw new MixtapePublishError('Could not publish right now. Your draft is safe — please try again.', 'server', response.status);
  }

  try {
    await throwIfNotOk(response, endpoint);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new MixtapePublishError(
        'Could not publish right now. Your draft is safe — please try again.',
        'server',
        err.status
      );
    }
    throw err;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new MixtapePublishError(
      'Publish response could not be read. Your draft is safe — please try again.',
      'invalid_response'
    );
  }

  const rawId =
    data && typeof data === 'object'
      ? ((data as { id?: unknown; Id?: unknown }).id ?? (data as { Id?: unknown }).Id)
      : undefined;
  const id = typeof rawId === 'string' ? rawId.trim() : '';

  if (!id || id === 'undefined' || id === 'null') {
    throw new MixtapePublishError(
      'Publish did not return a mixtape ID. Your draft is safe — please try again.',
      'invalid_response'
    );
  }

  const receipt = data as Partial<MixtapeWriteReceipt>;
  return {
    ...(receipt.visibility === 'public' || receipt.visibility === 'owner' ? { visibility: receipt.visibility } : {}),
    hiddenReason: typeof receipt.hiddenReason === 'string' ? receipt.hiddenReason : null,
    relatedMixtapeId: typeof receipt.relatedMixtapeId === 'string' ? receipt.relatedMixtapeId : null,
    relatedMixtapeTitle: typeof receipt.relatedMixtapeTitle === 'string' ? receipt.relatedMixtapeTitle : null,
    deduplicated: receipt.deduplicated === true,
    id,
  };
}

function coverUrlsFor(ids: readonly (string | null | undefined)[]): (string | null)[] {
  const coverUrls: (string | null)[] = [];
  for (let i = 0; i < Math.min(4, ids.length); i++) {
    const smolId = ids[i];
    coverUrls.push(smolId ? `${API_URL}/image/${smolId}.png` : null);
  }
  while (coverUrls.length < 4) coverUrls.push(null);
  return coverUrls;
}

export function toOwnedMixtape(data: ApiOwnedMixtape): OwnedMixtape {
  const trackIds = Array.isArray(data.Smols) ? data.Smols.filter((id): id is string => typeof id === 'string') : [];
  return {
    id: data.Id,
    title: data.Title,
    description: data.Desc ?? '',
    creator: data.Address,
    trackCount: trackIds.length,
    coverUrls: coverUrlsFor(trackIds),
    createdAt: data.Created_At,
    updatedAt: data.Updated_At ?? data.Created_At,
    trackIds,
    visibility: data.Visibility === 'owner' ? 'owner' : 'public',
    hiddenReason: data.Hidden_Reason ?? null,
    relatedMixtapeId: data.Related_Mixtape_Id ?? null,
    relatedMixtapeTitle: data.Related_Mixtape_Title ?? null,
    uniquenessScore: data.Uniqueness_Score ?? null,
    advice: data.Advice ?? null,
    revision: typeof data.Revision === 'number' ? data.Revision : 1,
    storedTrackCount: typeof data.Stored_Track_Count === 'number' ? data.Stored_Track_Count : trackIds.length,
    publicTrackCount: typeof data.Public_Track_Count === 'number' ? data.Public_Track_Count : trackIds.length,
  };
}

export function toMixtapeSummaries(data: ApiMixtape[]): MixtapeSummary[] {
  return data.filter((mixtape) => Array.isArray(mixtape.Smols) && mixtape.Smols.length > 0).map((mixtape) => {
    const coverUrls: (string | null)[] = [];

    for (let i = 0; i < Math.min(4, mixtape.Smols.length); i++) {
      const smolId = mixtape.Smols[i];
      coverUrls.push(smolId ? `${API_URL}/image/${smolId}.png` : null);
    }

    while (coverUrls.length < 4) {
      coverUrls.push(null);
    }

    return {
      id: mixtape.Id,
      title: mixtape.Title,
      description: mixtape.Desc,
      creator: mixtape.Address,
      trackCount: mixtape.Smols.length,
      coverUrls,
      updatedAt: mixtape.Updated_At ?? mixtape.Created_At,
    };
  });
}

export async function listMixtapes(options: { fresh?: boolean } = {}): Promise<MixtapeSummary[]> {
  const endpoint = `${API_URL}/mixtapes`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      credentials: 'include',
      ...(options.fresh ? { cache: 'no-store' as RequestCache } : {}),
    });
  } catch {
    throw new Error('Couldn’t reach SMOL right now. Check your connection and try again.');
  }

  await throwIfNotOk(response, endpoint);

  const data: ApiMixtape[] = await response.json();
  return toMixtapeSummaries(data);
}

export type MixtapeDetailResult =
  | { kind: 'found'; detail: MixtapeDetail }
  | { kind: 'not_found' }
  | { kind: 'merged'; mergedInto: string };

/** Interpret a GET /mixtapes/:id 404 body: `{ code: 'mixtape_merged', mergedInto }` → merged. */
export function parseMixtapeNotFound(body: unknown): MixtapeDetailResult {
  if (body && typeof body === 'object') {
    const { code, mergedInto } = body as { code?: unknown; mergedInto?: unknown };
    if (code === 'mixtape_merged' && typeof mergedInto === 'string' && mergedInto.trim()) {
      return { kind: 'merged', mergedInto: mergedInto.trim() };
    }
  }
  return { kind: 'not_found' };
}

/**
 * GET /mixtapes/:id with the merged-redirect contract. `fresh` bypasses the
 * browser HTTP cache (used right after an owner write).
 */
export async function fetchMixtapeDetail(
  id: string,
  options: { signal?: AbortSignal; fresh?: boolean } = {}
): Promise<MixtapeDetailResult> {
  const endpoint = `${API_URL}/mixtapes/${encodeURIComponent(id)}`;
  const response = await fetchWithTimeout(endpoint, {
    credentials: 'include',
    signal: options.signal,
    ...(options.fresh ? { cache: 'no-store' as RequestCache } : {}),
  });

  if (response.status === 404) {
    return parseMixtapeNotFound(await response.json().catch(() => null));
  }

  await throwIfNotOk(response, endpoint);
  return { kind: 'found', detail: toMixtapeDetail(await response.json()) };
}

// ---------------------------------------------------------------------------
// Owner lifecycle (smol-workflow src/api/mixtapes.ts)
// ---------------------------------------------------------------------------

const SESSION_EXPIRED = 'Your session expired. Sign in to save. Your changes are kept on this device.';
const NETWORK_ERROR = 'Couldn’t reach SMOL. Your changes are saved on this device.';

async function readErrorBody(response: Response): Promise<{ json: Record<string, unknown> | null; text: string }> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text);
    return { json: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null, text };
  } catch {
    return { json: null, text };
  }
}

async function ownerRequest(
  path: string,
  init: { method: string; body?: unknown },
  context: { action: string }
): Promise<unknown> {
  const endpoint = `${API_URL}${path}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: init.method,
      credentials: 'include',
      cache: 'no-store',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeout: LONG_TIMEOUT,
    });
  } catch {
    throw new MixtapeActionError(NETWORK_ERROR, 'network');
  }

  if (response.ok) {
    return await response.json().catch(() => {
      throw new MixtapeActionError(`Couldn’t read the response to ${context.action}. Please try again.`, 'server', { status: response.status });
    });
  }

  const { json, text } = await readErrorBody(response);
  const code = typeof json?.code === 'string' ? json.code : undefined;
  const status = response.status;

  if (status === 401) throw new MixtapeActionError(SESSION_EXPIRED, 'auth', { status });
  if (status === 403) throw new MixtapeActionError('Only the creator can change this mixtape.', 'forbidden', { status });
  if (code === 'mixtape_merged') {
    throw new MixtapeActionError('This mixtape was merged into another mixtape.', 'merged', {
      status,
      code,
      mergedInto: typeof json?.mergedInto === 'string' ? json.mergedInto : null,
    });
  }
  if (status === 404) throw new MixtapeActionError('This mixtape was already deleted.', 'not_found', { status });
  if (code === 'concurrent_delete') {
    // The row was deleted around this write (BE 409): never offer Load latest / Save mine anyway.
    throw new MixtapeActionError('This mixtape was deleted on another device, so these changes can’t be saved.', 'not_found', { status, code });
  }
  if (code === 'revision_conflict') {
    const current = json?.current && typeof json.current === 'object' ? toOwnedMixtape(json.current as ApiOwnedMixtape) : null;
    if (!current) {
      // A conflict with no current row means it no longer exists (deleted / merged meanwhile).
      throw new MixtapeActionError('This mixtape was deleted on another device, so these changes can’t be saved.', 'not_found', { status, code });
    }
    throw new MixtapeActionError('This mixtape was changed on another device.', 'revision_conflict', { status, code, current });
  }
  if (code === 'merge_unavailable_tracks') {
    const count = typeof json?.unavailableCount === 'number' ? json.unavailableCount : 0;
    const songs = count === 1 ? '1 song in this mixtape isn’t' : `${count} songs in this mixtape aren’t`;
    throw new MixtapeActionError(
      `${songs} public right now, so merging would lose ${count === 1 ? 'it' : 'them'}. Remove ${count === 1 ? 'it' : 'them'} first, or try again once ${count === 1 ? 'it’s' : 'they’re'} public.`,
      'merge_unavailable_tracks',
      { status, code, unavailableCount: count }
    );
  }
  if (status === 409) {
    throw new MixtapeActionError('This mixtape changed while you were working on it. Refresh and try again.', 'revision_conflict', { status, code });
  }
  if (status === 400) {
    // HTTPException bodies are plain text (no JSON envelope).
    const raw = typeof json?.error === 'string' ? json.error : text;
    if (/max\s*100|100\)|more than 100|would have \d+ songs/i.test(raw)) {
      throw new MixtapeActionError(`Mixtapes can hold up to ${MAX_MIXTAPE_TRACKS} songs.`, 'too_many_tracks', { status });
    }
    if (/public smols/i.test(raw)) {
      throw new MixtapeActionError('Some songs aren’t public anymore. Remove them and try again.', 'invalid', { status });
    }
    if (/title/i.test(raw)) {
      throw new MixtapeActionError('Give your mixtape a name.', 'invalid', { status });
    }
    throw new MixtapeActionError(`Couldn’t ${context.action}. Check the mixtape and try again.`, 'invalid', { status });
  }
  if (status === 503) {
    throw new MixtapeActionError(`SMOL is still finishing that. Try again in a moment.`, 'server', { status, code });
  }
  throw new MixtapeActionError(`Couldn’t ${context.action} right now. Please try again.`, 'server', { status, code });
}

function toWriteReceipt(data: unknown, fallbackId: string): MixtapeWriteReceipt {
  const raw = (data && typeof data === 'object' ? data : {}) as Partial<MixtapeWriteReceipt>;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallbackId,
    visibility: raw.visibility === 'owner' ? 'owner' : 'public',
    hiddenReason: typeof raw.hiddenReason === 'string' ? raw.hiddenReason : null,
    relatedMixtapeId: typeof raw.relatedMixtapeId === 'string' ? raw.relatedMixtapeId : null,
    relatedMixtapeTitle: typeof raw.relatedMixtapeTitle === 'string' ? raw.relatedMixtapeTitle : null,
    advice: typeof raw.advice === 'string' ? raw.advice : null,
    uniquenessScore: typeof raw.uniquenessScore === 'number' ? raw.uniquenessScore : null,
    revision: typeof raw.revision === 'number' ? raw.revision : 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    ...(raw.deduplicated ? { deduplicated: true } : {}),
  };
}

function assertId(id: string): string {
  const clean = typeof id === 'string' ? id.trim() : '';
  if (!clean || clean === 'undefined' || clean === 'null') {
    throw new MixtapeActionError('This mixtape couldn’t be found. Refresh and try again.', 'not_found');
  }
  return clean;
}

/** GET /mixtapes/mine — every non-deleted mixtape of the signed-in owner (listed + hidden). */
export async function listMyMixtapes(): Promise<OwnedMixtape[]> {
  const data = await ownerRequest('/mixtapes/mine', { method: 'GET' }, { action: 'load your mixtapes' });
  return Array.isArray(data) ? (data as ApiOwnedMixtape[]).map(toOwnedMixtape) : [];
}

/** PUT /mixtapes/:id — full replace with optimistic concurrency (`expectedRevision`). */
export async function updateMixtape(
  id: string,
  payload: MixtapeUpdatePayload
): Promise<MixtapeWriteReceipt & { mixtape: OwnedMixtape | null }> {
  const mixtapeId = assertId(id);
  const data = await ownerRequest(
    `/mixtapes/${encodeURIComponent(mixtapeId)}`,
    {
      method: 'PUT',
      body: {
        title: payload.title.trim(),
        // B-26: empty description is accepted by the API.
        desc: payload.description.trim() ? payload.description : '',
        smols: payload.smols,
        ...(payload.expectedRevision ? { expectedRevision: payload.expectedRevision } : {}),
      },
    },
    { action: 'save this mixtape' }
  );
  const raw = (data ?? {}) as { mixtape?: ApiOwnedMixtape };
  return { ...toWriteReceipt(data, mixtapeId), mixtape: raw.mixtape ? toOwnedMixtape(raw.mixtape) : null };
}

/** DELETE /mixtapes/:id — soft delete, undoable via restoreMixtape(). */
export async function deleteMixtape(id: string): Promise<{ id: string; deleted: true; undoable: boolean }> {
  const mixtapeId = assertId(id);
  const data = (await ownerRequest(`/mixtapes/${encodeURIComponent(mixtapeId)}`, { method: 'DELETE' }, { action: 'delete this mixtape' })) as {
    undoable?: boolean;
  };
  return { id: mixtapeId, deleted: true, undoable: data?.undoable !== false };
}

/** POST /mixtapes/:id/restore — undo a soft delete. */
export async function restoreMixtape(id: string): Promise<MixtapeWriteReceipt & { mixtape: OwnedMixtape | null }> {
  const mixtapeId = assertId(id);
  const data = await ownerRequest(`/mixtapes/${encodeURIComponent(mixtapeId)}/restore`, { method: 'POST', body: {} }, { action: 'restore this mixtape' });
  const raw = (data ?? {}) as { mixtape?: ApiOwnedMixtape };
  return { ...toWriteReceipt(data, mixtapeId), mixtape: raw.mixtape ? toOwnedMixtape(raw.mixtape) : null };
}

/** POST /mixtapes/:sourceId/merge — append the source's songs to the target, then retire the source. */
export async function mergeMixtape(
  sourceId: string,
  targetId: string,
  opts: { title?: string; description?: string } = {}
): Promise<MixtapeMergeResult> {
  const source = assertId(sourceId);
  const target = assertId(targetId);
  const data = (await ownerRequest(
    `/mixtapes/${encodeURIComponent(source)}/merge`,
    {
      method: 'POST',
      body: {
        targetId: target,
        ...(opts.title !== undefined ? { title: opts.title } : {}),
        ...(opts.description !== undefined ? { desc: opts.description } : {}),
      },
    },
    { action: 'merge these mixtapes' }
  )) as Partial<Omit<MixtapeMergeResult, 'target' | 'targetDeletedConcurrently'>> & {
    target?: ApiOwnedMixtape | null;
    targetDeletedConcurrently?: boolean;
  };
  return {
    targetId: typeof data?.targetId === 'string' ? data.targetId : target,
    mergedId: typeof data?.mergedId === 'string' ? data.mergedId : source,
    addedCount: typeof data?.addedCount === 'number' ? data.addedCount : 0,
    totalTracks: typeof data?.totalTracks === 'number' ? data.totalTracks : 0,
    target: data?.target ? toOwnedMixtape(data.target) : null,
    targetDeletedConcurrently: data?.targetDeletedConcurrently === true,
  };
}

/** POST /mixtapes/check-uniqueness — Tier 1 server preview (zero AI). */
export async function checkMixtapeUniqueness(payload: {
  id?: string;
  title?: string;
  description?: string;
  smols?: string[];
}): Promise<MixtapeUniquenessResult> {
  const data = (await ownerRequest(
    '/mixtapes/check-uniqueness',
    {
      method: 'POST',
      body: {
        ...(payload.id ? { id: payload.id } : {}),
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.description !== undefined ? { desc: payload.description } : {}),
        ...(payload.smols !== undefined ? { smols: payload.smols } : {}),
      },
    },
    { action: 'check this mixtape' }
  )) as MixtapeUniquenessResult;
  return data;
}

export function toMixtapeDetail(data: ApiMixtapeDetail): MixtapeDetail {
  const coverUrls = coverUrlsFor(data.Smols.map((smol) => smol?.Id));

  return {
    id: data.Id,
    title: data.Title,
    description: data.Desc ?? '',
    trackCount: data.Smols.length,
    coverUrls,
    updatedAt: data.Updated_At ?? data.Created_At,
    createdAt: data.Created_At,
    creator: data.Address,
    tracks: data.Smols,
    ...(data.Visibility === 'public' || data.Visibility === 'owner' ? { visibility: data.Visibility } : {}),
    ...(data.Hidden_Reason !== undefined ? { hiddenReason: data.Hidden_Reason } : {}),
    ...(data.Related_Mixtape_Id !== undefined ? { relatedMixtapeId: data.Related_Mixtape_Id } : {}),
    ...(data.Related_Mixtape_Title !== undefined ? { relatedMixtapeTitle: data.Related_Mixtape_Title } : {}),
    ...(data.Uniqueness_Score !== undefined ? { uniquenessScore: data.Uniqueness_Score } : {}),
    ...(data.Advice !== undefined ? { advice: data.Advice } : {}),
    ...(typeof data.Revision === 'number' ? { revision: data.Revision } : {}),
    ...(typeof data.Stored_Track_Count === 'number' ? { storedTrackCount: data.Stored_Track_Count } : {}),
    ...(typeof data.Public_Track_Count === 'number' ? { publicTrackCount: data.Public_Track_Count } : {}),
  };
}
