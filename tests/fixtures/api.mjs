import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { collectMixtapes, collectSongs } from './collect.mjs';
import * as ownerMixtapes from './ownerMixtapes.mjs';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Generate deterministic crisp 16x16 pixel-art PNG per track ID so renders show authentic covers.
const PALETTES = [
  [[15, 23, 42], [154, 230, 0], [56, 189, 248], [248, 250, 252]],
  [[30, 27, 75], [244, 114, 182], [251, 191, 36], [224, 231, 255]],
  [[12, 34, 34], [52, 211, 153], [250, 204, 21], [236, 253, 245]],
  [[45, 18, 30], [251, 113, 133], [253, 186, 116], [255, 241, 242]],
  [[17, 24, 39], [96, 165, 250], [167, 139, 250], [241, 245, 249]],
  [[28, 25, 23], [245, 158, 11], [132, 204, 22], [254, 243, 199]],
];

const imageCache = new Map();
function pixelArtPng(seedStr) {
  if (imageCache.has(seedStr)) return imageCache.get(seedStr);
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const palette = PALETTES[hash % PALETTES.length];
  const size = 16;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const sx = x < size / 2 ? x : size - 1 - x;
      const cell = ((sx * 31 + y * 17 + hash) ^ (hash >>> ((sx + y) % 13))) >>> 0;
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const idx = border ? 0 : cell % 7 < 3 ? 0 : cell % 7 < 5 ? 1 : cell % 7 === 5 ? 2 : 3;
      const [r, g, b] = palette[idx];
      row[1 + x * 3] = r;
      row[1 + x * 3 + 1] = g;
      row[1 + x * 3 + 2] = b;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  imageCache.set(seedStr, png);
  return png;
}

function loadJson(name) {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
}

const address = 'fixture-artist';
const artist = { Address: address, Username: 'Fixture Artist' };
const tracks = [
  { Id: 'first-smol', Title: 'First Track', Song_1: 'first', Plays: 42, Views: 120 },
  { Id: 'missing-smol', Title: 'Unavailable Track', Plays: 0, Views: 5 },
  { Id: 'second-smol', Title: 'Second Track', Song_1: 'second', Plays: 18, Views: 64 },
  { Id: 'third-smol', Title: 'Third Track', Song_1: 'third', Plays: 29, Views: 80 },
  { Id: 'smol-2take', Title: 'Neon Arcade Runner', Song_1: 'take-1', Plays: 55, Views: 140 },
  { Id: 'smol-1take', Title: 'Velvet Rain Echo', Song_1: 'el-only-1', Plays: 33, Views: 90 },
  { Id: 'smol-fallback', Title: 'Midnight Harbor Signal', Song_1: 'fallback-1', Plays: 21, Views: 72 },
  { Id: 'cjk-smol', Title: '金色余音 · Golden Echo', Song_1: 'first', Plays: 14, Views: 51 },
  {
    Id: 'smol-minted',
    Title: 'Starlight Mint Anthem',
    Song_1: 'minted-1',
    Plays: 77,
    Views: 210,
    Mint_Token: 'CMINTTOKEN000000000000000000000000000000000000000000000001',
    Mint_Amm: 'CMINTAMM00000000000000000000000000000000000000000000000001',
  },
].map((track) => ({ ...track, Address: address, Public: 1 }));

const { Smols, ...mixtape } = {
  Id: 'fixture-mixtape',
  Title: 'Fixture Mixtape',
  Desc: 'Late-night synthwave and pixel ballads for mobile and car listening.',
  Smols: tracks.slice(0, 4),
  Address: address,
  Created_At: '2026-10-01',
};

const secondMixtape = {
  Id: 'arcade-nights',
  Title: 'Arcade Nights',
  Desc: 'Chiptune beats and dreamy retro instrumentals.',
  Smols: ['smol-2take', 'smol-1take', 'smol-fallback'],
  Address: address,
  Created_At: '2026-11-12',
};

const list = { smols: tracks, users: [artist], pagination: { hasMore: false, nextCursor: null } };
ownerMixtapes.registerCatalog(tracks);

const smol2Take = loadJson('smol-2take.json');
const smol1Take = loadJson('smol-1take.json');
const smolFallback = loadJson('smol-fallback.json');
const smolFailed = loadJson('smol-failed.json');
const smolFailedPolicy = loadJson('smol-failed-policy.json');
const smolGenerating = loadJson('smol-generating.json');
const smolMinted = loadJson('smol-minted.json');
const smolPrivate = loadJson('smol-private.json');
const smolFlagged = loadJson('smol-flagged.json');
const smolGeneratingEarly = loadJson('smol-generating-early.json');
const smolGeneratingPartial = loadJson('smol-generating-partial.json');
const smolFailedConfig = loadJson('smol-failed-config.json');
// AE-3 robots states (FE-1 pass 2). Publishing updates D1 only, so a song that
// was generated private and later published keeps `payload.public: false`.
const smolPublishedWasPrivate = (() => {
  const s = structuredClone(smolMinted);
  s.d1.Id = 'smol-published-was-private';
  s.d1.Public = 1;
  s.kv_do.payload = { ...s.kv_do.payload, public: false };
  s.kv_do.nsfw = { safe: true, categories: [] };
  return s;
})();
// The safety check could not decide: `unknown: true` and no `safe` at all.
const smolSafetyUnknown = (() => {
  const s = structuredClone(smolMinted);
  s.d1.Id = 'smol-safety-unknown';
  s.d1.Public = 1;
  s.kv_do.payload = { ...s.kv_do.payload, public: true };
  s.kv_do.nsfw = { unknown: true, categories: [] };
  return s;
})();

const DEFAULT_QUOTA = {
  classic: { limit: 10, used: 3, remaining: 7, resetAt: '2026-11-24T00:00:00.000Z' },
  elevenlabs: { limit: 3, used: 1, remaining: 2, resetAt: '2026-11-24T00:00:00.000Z' },
};

const routes = new Map([
  ['/__ready', {}],
  ['/', list],
  ['/quota', DEFAULT_QUOTA],
  ['/created', list],
  ['/liked', { ...list, smols: tracks.slice(0, 3) }],
  ['/playlist/arcade', list],
  ['/artists/fixture-artist/smols', { ...list, artist }],
  ['/mixtapes', [{ ...mixtape, Smols: Smols.map((track) => track.Id) }, secondMixtape]],
  ['/mixtapes/fixture-mixtape', { ...mixtape, Smols }],
  ...Object.entries(collectMixtapes).map(([id, data]) => [`/mixtapes/${id}`, data]),
  ...Object.entries(collectSongs),
  ['/search', { results: tracks.slice(0, 4).map((t, i) => ({ ...t, score: 1 - i * 0.1 })) }],
  ['/search/first-smol/similar', { results: tracks.slice(2, 6).map((t, i) => ({ ...t, score: 0.9 - i * 0.1 })) }],
  ['/search/smol-2take/similar', { results: tracks.slice(0, 4).map((t, i) => ({ ...t, score: 0.9 - i * 0.1 })) }],
  ['/search/smol-1take/similar', { results: tracks.slice(0, 4).map((t, i) => ({ ...t, score: 0.9 - i * 0.1 })) }],
  ['/search/smol-fallback/similar', { results: tracks.slice(0, 4).map((t, i) => ({ ...t, score: 0.9 - i * 0.1 })) }],
  ['/search/smol-minted/similar', { results: tracks.slice(0, 4).map((t, i) => ({ ...t, score: 0.9 - i * 0.1 })) }],
  ['/likes', ['smol-1take']],
  ['/first-smol', {
    d1: { ...tracks[0], Song_2: 'alternate', Created_At: '2026-11-01T10:00:00Z', Requested_Provider: 'aisonggenerator', Actual_Provider: 'aisonggenerator' },
    kv_do: {
      payload: { prompt: 'Bright synth melodies over punchy drums', instrumental: false, public: true, provider: 'aisonggenerator' },
      generation_meta: { requested_provider: 'aisonggenerator', actual_provider: 'aisonggenerator' },
      description: 'A glowing pixel synthesizer under midnight stars.',
      image: true,
      nsfw: { safe: true, categories: [] },
      lyrics: {
        title: tracks[0].Title,
        style: ['Synthpop', 'Electronic'],
        lyrics: 'First verse pulsing through the wire\nCity lights climbing higher\nKeep the rhythm moving on\nUntil the morning breaks the dawn',
      },
      songs: [
        { music_id: 'first', status: 4 },
        { music_id: 'alternate', status: 4, audio: 'http://127.0.0.1:4329/song/alternate-fallback.mp3' },
      ],
    },
  }],
  ['/smol-2take', smol2Take],
  ['/smol-1take', smol1Take],
  ['/smol-fallback', smolFallback],
  ['/smol-failed', smolFailed],
  ['/smol-failed-policy', smolFailedPolicy],
  ['/smol-generating', smolGenerating],
  ['/smol-minted', smolMinted],
  ['/smol-private', smolPrivate],
  ['/smol-flagged', smolFlagged],
  ['/smol-generating-early', smolGeneratingEarly],
  ['/smol-generating-partial', smolGeneratingPartial],
  ['/smol-failed-config', smolFailedConfig],
  ['/smol-published-was-private', smolPublishedWasPrivate],
  ['/smol-safety-unknown', smolSafetyUnknown],
]);

const requests = new Map();
let requestCookieSeq = 0;
const requestCookieHistory = [];
let lastCreateBody = null;
let lastRetryBody = null;
let swapCalls = [];
let publishCalls = [];
let playBeacons = [];
let loginCalls = [];
let loginTokenSeq = 0;
let logoutCalls = 0;
let failNextSsrMixtapes = false;

function recordSsrCookie(path, req) {
  requestCookieSeq += 1;
  requestCookieHistory.push({ seq: requestCookieSeq, path, cookie: req.headers.cookie ?? '' });
  if (requestCookieHistory.length > 500) {
    requestCookieHistory.shift();
  }
}

function makeFixtureJwt(sub, key) {
  loginTokenSeq += 1;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      key,
      jti: `fixture-${loginTokenSeq}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.fixture-sig`;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  const origin = req.headers.origin || 'http://127.0.0.1:4328';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers).end();
    return;
  }

  if (path.startsWith('/image/')) {
    const png = pixelArtPng(path);
    res.writeHead(200, { ...headers, 'Content-Type': 'image/png' }).end(png);
    return;
  }

  if (path === '/__reset') {
    requests.clear();
    lastCreateBody = null;
    lastRetryBody = null;
    swapCalls = [];
    publishCalls = [];
    playBeacons = [];
    loginCalls = [];
    logoutCalls = 0;
    res.writeHead(200, headers).end();
    return;
  }

  if (path === '/__ssr-cookies') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
      .end(JSON.stringify({ seq: requestCookieSeq, entries: requestCookieHistory }));
    return;
  }

  if (path === '/__requests') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
      .end(JSON.stringify(Object.fromEntries(requests)));
    return;
  }

  if (path === '/__mutations') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
      .end(JSON.stringify({
        lastCreateBody,
        lastRetryBody,
        swapCalls,
        publishCalls,
        playBeacons,
        lastMixtapeBody: ownerMixtapes.lastMixtapeBody,
        ownerMutations: ownerMixtapes.mutationLog,
        loginCalls,
        logoutCalls,
      }));
    return;
  }

  if (path === '/__fail-next-ssr-mixtapes') {
    failNextSsrMixtapes = req.method === 'POST';
    res.writeHead(204, headers).end();
    return;
  }

  if (req.method === 'POST' && path === '/login') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const contractId = typeof body.contractId === 'string' && body.contractId ? body.contractId : 'CFIXTUREUSER0000000000000000000000000000000000000000000001';
    const keyId = typeof body.keyId === 'string' && body.keyId ? body.keyId : 'fixture-key-1';
    const jwt = makeFixtureJwt(contractId, keyId);
    loginCalls.push({
      body,
      origin: req.headers.origin ?? null,
      cookie: req.headers.cookie ?? null,
    });
    res.writeHead(200, {
      ...headers,
      'Content-Type': 'text/plain',
      'Set-Cookie': `smol_token=${jwt}; Path=/; SameSite=Lax`,
    }).end(jwt);
    return;
  }

  if (req.method === 'POST' && path === '/logout') {
    logoutCalls += 1;
    res.writeHead(204, {
      ...headers,
      'Set-Cookie': 'smol_token=; Path=/; Max-Age=0; SameSite=Lax',
    }).end();
    return;
  }

  if (path.startsWith('/__owner/')) {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
      .end(JSON.stringify(ownerMixtapes.snapshotCohort(path.slice('/__owner/'.length))));
    return;
  }

  // Owner lifecycle (GET /mixtapes/mine, /mixtapes/mx-*, PUT/DELETE/restore/merge, POST /mixtapes).
  if (path === '/mixtapes' && req.method === 'GET') {
    recordSsrCookie(path, req);
    // Test hook: when armed by P2-4 (@isolated), the SERVER-side (SSR, no Origin header) list read fails,
    // so the page must load All in the browser without requiring smol_token on public GET /mixtapes SSR.
    if (failNextSsrMixtapes && !req.headers.origin) {
      failNextSsrMixtapes = false;
      res.writeHead(503, { ...headers, 'Content-Type': 'text/plain' }).end('upstream unavailable');
      return;
    }
    const staticList = routes.get('/mixtapes');
    requests.set(path, (requests.get(path) ?? 0) + 1);
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
      .end(JSON.stringify([...staticList, ...ownerMixtapes.publicDemoRows()]));
    return;
  }
  if (path.startsWith('/mixtapes') && (await ownerMixtapes.handleOwnerRoute(req, res, path, headers))) {
    return;
  }

  // Live smol-workflow routes POST /mint/status to POST /mint/:id → 400 (Report 34).
  if (req.method === 'POST' && path === '/mint/status') {
    requests.set('POST /mint/status', (requests.get('POST /mint/status') ?? 0) + 1);
    res.writeHead(400, { ...headers, 'Content-Type': 'text/plain' }).end('Missing signed XDR');
    return;
  }

  if (req.method === 'POST' && path.startsWith('/plays/')) {
    const musicId = decodeURIComponent(path.slice('/plays/'.length));
    playBeacons.push(musicId);
    res.writeHead(204, headers).end();
    return;
  }

  if (req.method === 'POST' && path === '/') {
    const raw = await readBody(req);
    lastCreateBody = raw ? JSON.parse(raw) : null;
    res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' }).end('smol-generating');
    return;
  }

  if (req.method === 'POST' && path.startsWith('/retry/')) {
    const raw = await readBody(req);
    lastRetryBody = raw ? JSON.parse(raw) : null;
    res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' }).end('smol-generating');
    return;
  }

  if (req.method === 'PUT' && /^\/[^/]+\/[^/]+$/.test(path)) {
    swapCalls.push(path);
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'PUT' && /^\/[^/]+$/.test(path) && !path.startsWith('/likes')) {
    publishCalls.push(path);
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'PUT' && path.startsWith('/likes/')) {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }

  requests.set(path, (requests.get(path) ?? 0) + 1);
  recordSsrCookie(path, req);
  const data = routes.get(path);
  res.writeHead(data === undefined ? 404 : 200, { ...headers, 'Content-Type': 'application/json' })
    .end(JSON.stringify(data ?? {}));
}).listen(Number(process.env.FIXTURE_API_PORT ?? 4329), '127.0.0.1');
