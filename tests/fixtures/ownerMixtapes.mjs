// Owner mixtape lifecycle fixture (Report 24 / MIXTAPE_DEDUPE_SPEC §3).
//
// Every test signs in as its own owner `CMIXOWNER<TAG>` and gets a private,
// lazily seeded cohort whose mixtape ids are `mx-<tag>-<slug>`, so parallel
// spec files (and /__reset from other suites) never disturb each other.
// Visibility is DERIVED with the very same Tier 1 classifier the FE mirrors
// from smol-workflow (Node strips the TS types natively).
import { classifyOwnerMixtapes } from '../../src/utils/mixtapeVisibility.ts';
import { CHAIN_OWNER, CHAIN_TAG, CHAIN_TRACK_INDEXED, chainTracks } from './ownerChain.mjs';

export const OWNER_PREFIX = 'CMIXOWNER';
const MAX_SMOLS = 100;

export const bulkTracks = Array.from({ length: 99 }, (_, i) => ({
  Id: `bulk-${String(i + 1).padStart(3, '0')}`,
  Title: `Bagel Track ${i + 1}`,
  Song_1: 'first',
  Address: 'fixture-artist',
  Public: 1,
}));

let catalog = new Map();
export function registerCatalog(tracks) {
  catalog = new Map([...tracks, ...bulkTracks, ...chainTracks].map((t) => [t.Id, t]));
}

const cohorts = new Map(); // tag -> Map(id -> row)
export let lastMixtapeBody = null;
export let mutationLog = [];

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function seed(tag) {
  if (tag === CHAIN_TAG) {
    // A collector-readable owner (real contract address) with one minted, indexed song.
    const cohort = new Map([[`mx-${CHAIN_TAG}-set`, {
      Id: `mx-${CHAIN_TAG}-set`, Title: 'Chain Set', Desc: 'Owned-song refresh check.', Smols: [CHAIN_TRACK_INDEXED.Id],
      Address: CHAIN_OWNER, Created_At: '2026-11-21 09:00:00', Updated_At: '2026-11-21 09:00:00',
      Revision: 1, Deleted_At: null, Hidden_Reason: null, Related_Mixtape_Id: null,
    }]]);
    cohorts.set(tag, cohort);
    return cohort;
  }
  const owner = `${OWNER_PREFIX}${tag.toUpperCase()}`;
  const id = (slug) => `mx-${tag}-${slug}`;
  const row = (slug, Title, Desc, Smols, Created_At, extra = {}) => ({
    Id: id(slug), Title, Desc, Smols, Address: owner, Created_At, Updated_At: Created_At,
    Revision: 1, Deleted_At: null, Hidden_Reason: null, Related_Mixtape_Id: null, ...extra,
  });
  const rows = [
    row('creasy-v2', 'Creasy Drops', 'Late-night drops.', ['first-smol', 'second-smol', 'third-smol'], '2026-11-20 10:04:27'),
    row('creasy-v1', 'Creasy Drops', 'Late-night drops.', ['first-smol'], '2026-11-20 10:00:00'),
    row('night-drive', 'Night Drive', 'Synthwave for the highway.', ['smol-2take', 'smol-1take', 'smol-fallback'], '2026-11-18 09:00:00'),
    row('solo', 'One Song Wonder', '', ['cjk-smol'], '2026-11-19 12:00:00'),
    row('bagel', 'Everything Bagel', 'All of it, all at once.', bulkTracks.map((t) => t.Id), '2026-11-10 08:00:00'),
    row('old-merged', 'Night Drive (old)', '', ['smol-2take'], '2026-11-01 08:00:00', {
      Deleted_At: '2026-11-02 08:00:00', Hidden_Reason: 'merged', Related_Mixtape_Id: id('night-drive'),
    }),
  ];
  const cohort = new Map(rows.map((r) => [r.Id, r]));
  cohorts.set(tag, cohort);
  return cohort;
}

function tagFromOwner(owner) {
  if (owner === CHAIN_OWNER) return CHAIN_TAG;
  return typeof owner === 'string' && owner.startsWith(OWNER_PREFIX) ? owner.slice(OWNER_PREFIX.length).toLowerCase() : null;
}

function cohortFor(tag) {
  return cohorts.get(tag) ?? seed(tag);
}

function cohortForId(mixtapeId) {
  const match = /^mx-([a-z0-9]+)-/.exec(mixtapeId);
  return match ? cohortFor(match[1]) : null;
}

export function sessionSub(req) {
  const cookie = req.headers.cookie ?? '';
  const token = /(?:^|;\s*)smol_token=([^;]+)/.exec(cookie)?.[1];
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(decodeURIComponent(token).split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

const isPublic = (smolId) => catalog.get(smolId)?.Public === 1;
const live = (cohort) => [...cohort.values()].filter((r) => !r.Deleted_At);

function decisionsFor(cohort) {
  return classifyOwnerMixtapes(
    live(cohort).map((r) => ({
      id: r.Id, address: r.Address, title: r.Title, desc: r.Desc, createdAt: r.Created_At,
      storedTracks: r.Smols, publicTracks: r.Smols.filter(isPublic),
    }))
  );
}

function ownerView(row, decision) {
  const publicIds = row.Smols.filter(isPublic);
  return {
    Id: row.Id, Title: row.Title, Desc: row.Desc, Address: row.Address,
    Created_At: row.Created_At, Updated_At: row.Updated_At, Smols: publicIds,
    Visibility: decision?.visibility ?? 'public',
    Hidden_Reason: decision?.hiddenReason ?? null,
    Related_Mixtape_Id: decision?.relatedId ?? null,
    Related_Mixtape_Title: decision?.relatedTitle ?? null,
    Uniqueness_Score: decision?.uniquenessScore ?? null,
    Advice: decision?.advice ?? null,
    Revision: row.Revision,
    Stored_Track_Count: row.Smols.length,
    Public_Track_Count: publicIds.length,
  };
}

function receipt(row, decision) {
  return {
    id: row.Id, visibility: decision.visibility, hiddenReason: decision.hiddenReason,
    relatedMixtapeId: decision.relatedId, relatedMixtapeTitle: decision.relatedTitle,
    advice: decision.advice, uniquenessScore: decision.uniquenessScore,
    revision: row.Revision, updatedAt: row.Updated_At,
  };
}

/** Public rows of the always-seeded demo cohort, appended to GET /mixtapes. */
export function publicDemoRows() {
  const cohort = cohortFor('demo');
  const decisions = decisionsFor(cohort);
  return live(cohort)
    .filter((r) => decisions.get(r.Id)?.visibility === 'public')
    .map((r) => ({ Id: r.Id, Title: r.Title, Desc: r.Desc, Smols: r.Smols.filter(isPublic), Address: r.Address, Created_At: r.Created_At, Updated_At: r.Updated_At }));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
  });
}

/**
 * Handles /mixtapes/mine, /mixtapes/mx-*, and owner mutations. Returns false
 * for anything it does not own so the legacy static routes keep working.
 */
export async function handleOwnerRoute(req, res, path, headers) {
  const json = (status, body, extra = {}) => {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }).end(JSON.stringify(body));
    return true;
  };
  const text = (status, body) => {
    res.writeHead(status, { ...headers, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end(body);
    return true;
  };

  if (req.method === 'POST' && path === '/mixtapes') {
    lastMixtapeBody = await readBody(req);
    return json(201, { id: 'fixture-mixtape', visibility: 'public', hiddenReason: null, relatedMixtapeId: null, relatedMixtapeTitle: null, advice: null, revision: 1 });
  }

  if (path === '/mixtapes/mine' && req.method === 'GET') {
    const sub = sessionSub(req);
    if (!sub) return text(401, 'Unauthorized');
    const tag = tagFromOwner(sub);
    if (!tag) return json(200, []);
    const cohort = cohortFor(tag);
    const decisions = decisionsFor(cohort);
    const rows = live(cohort).sort((a, b) => (a.Created_At < b.Created_At ? 1 : -1));
    return json(200, rows.map((r) => ownerView(r, decisions.get(r.Id))));
  }

  const m = /^\/mixtapes\/(mx-[a-z0-9]+-[a-z0-9-]+?)(\/restore|\/merge)?$/.exec(path);
  if (!m) return false;
  const [, mixtapeId, action] = m;
  const cohort = cohortForId(mixtapeId);
  const row = cohort?.get(mixtapeId);

  if (req.method === 'GET' && !action) {
    if (!row) return json(404, { error: 'Mixtape not found' });
    if (row.Deleted_At) {
      if (row.Hidden_Reason === 'merged' && row.Related_Mixtape_Id) {
        return json(404, { error: 'This mixtape was merged into another mixtape', code: 'mixtape_merged', mergedInto: row.Related_Mixtape_Id });
      }
      return json(404, { error: 'Mixtape not found' });
    }
    const view = ownerView(row, decisionsFor(cohort).get(row.Id));
    const smols = view.Smols.map((id) => {
      const t = catalog.get(id);
      return {
        Id: t.Id, Title: t.Title, Address: t.Address, Public: 1, Song_1: t.Song_1 ?? 'first', Tags: [],
        ...(t.Mint_Token ? { Mint_Token: t.Mint_Token, Mint_Amm: t.Mint_Amm } : {}),
      };
    });
    return json(200, { ...view, Smols: smols }, view.Visibility !== 'public' ? { 'X-Robots-Tag': 'noindex' } : {});
  }

  // ---- owner-only mutations ----
  const sub = sessionSub(req);
  if (!sub) return text(401, 'User session required');
  if (!row) return text(404, 'Mixtape not found');
  if (row.Address !== sub) return text(403, 'Only the mixtape owner can change it');
  const body = await readBody(req);
  if (body === null) return text(400, 'Invalid JSON body');
  mutationLog.push({ method: req.method, path, body });

  const conflict = () => json(409, {
    error: 'This mixtape was changed somewhere else. Review the latest version and try again.',
    code: 'revision_conflict',
    current: ownerView(row, decisionsFor(cohort).get(row.Id)),
  });

  if (req.method === 'PUT' && !action) {
    if (row.Deleted_At) return text(404, 'Mixtape not found');
    if (body.expectedRevision !== undefined && body.expectedRevision !== row.Revision) return conflict();
    if (typeof body.title !== 'string' || !body.title.trim()) return text(400, 'Missing or invalid title');
    if (!Array.isArray(body.smols) || body.smols.length === 0) return text(400, 'Missing or invalid smols array');
    if (body.smols.length > MAX_SMOLS) return text(400, `Max ${MAX_SMOLS} smols per mixtape`);
    if (!body.smols.every(isPublic)) return text(400, 'Mixtapes can only include public smols');
    row.Title = body.title;
    row.Desc = typeof body.desc === 'string' ? body.desc : '';
    row.Smols = [...body.smols];
    row.Revision += 1;
    row.Updated_At = now();
    const decision = decisionsFor(cohort).get(row.Id);
    return json(200, { ...receipt(row, decision), mixtape: ownerView(row, decision) });
  }

  if (req.method === 'DELETE' && !action) {
    if (!row.Deleted_At) {
      row.Deleted_At = now();
      row.Hidden_Reason = 'deleted';
      row.Revision += 1;
    }
    return json(200, { id: row.Id, deleted: true, undoable: true });
  }

  if (req.method === 'POST' && action === '/restore') {
    if (row.Deleted_At && row.Hidden_Reason === 'merged') {
      return json(409, { error: 'Merged mixtapes cannot be restored', code: 'mixtape_merged', mergedInto: row.Related_Mixtape_Id });
    }
    if (row.Deleted_At) {
      row.Deleted_At = null;
      row.Hidden_Reason = null;
      row.Revision += 1;
      row.Updated_At = now();
    }
    const decision = decisionsFor(cohort).get(row.Id);
    return json(200, { ...receipt(row, decision), restored: true, mixtape: ownerView(row, decision) });
  }

  if (req.method === 'POST' && action === '/merge') {
    const target = cohort.get(body.targetId);
    if (!target || target.Deleted_At || row.Deleted_At) return text(404, 'Mixtape not found');
    if (target.Address !== sub) return text(403, 'Only the mixtape owner can change it');
    const targetSet = new Set(target.Smols);
    const unavailable = row.Smols.filter((id) => !isPublic(id) && !targetSet.has(id)).length;
    if (unavailable > 0) {
      return json(409, { error: 'Songs are not public right now', code: 'merge_unavailable_tracks', unavailableCount: unavailable });
    }
    const added = row.Smols.filter((id) => !targetSet.has(id));
    const merged = [...target.Smols, ...added];
    if (merged.length > MAX_SMOLS) return text(400, `Merged mixtape would have ${merged.length} songs (max ${MAX_SMOLS})`);
    target.Smols = merged;
    target.Revision += 1;
    target.Updated_At = now();
    row.Deleted_At = now();
    row.Hidden_Reason = 'merged';
    row.Related_Mixtape_Id = target.Id;
    const decision = decisionsFor(cohort).get(target.Id);
    return json(200, { targetId: target.Id, mergedId: row.Id, addedCount: added.length, totalTracks: merged.length, target: ownerView(target, decision) });
  }

  return text(405, 'Method not allowed');
}

/** Test-only peek at a cohort's raw rows (GET /__owner/:tag). */
export function snapshotCohort(tag) {
  const cohort = cohortFor(tag);
  const decisions = decisionsFor(cohort);
  return [...cohort.values()].map((r) => ({ ...r, decision: decisions.get(r.Id) ?? null }));
}
