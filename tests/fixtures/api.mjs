import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const cover = readFileSync(new URL('../../public/favicon.png', import.meta.url));
const address = 'fixture-artist';
const artist = { Address: address, Username: 'Fixture Artist' };
const tracks = [
  { Id: 'first-smol', Title: 'First Track', Song_1: 'first' },
  { Id: 'missing-smol', Title: 'Unavailable Track' },
  { Id: 'second-smol', Title: 'Second Track', Song_1: 'second' },
  { Id: 'third-smol', Title: 'Third Track', Song_1: 'third' },
].map((track) => ({ ...track, Address: address, Public: 1 }));
const { Smols, ...mixtape } = {
  Id: 'fixture-mixtape',
  Title: 'Fixture Mixtape',
  Desc: 'Tracks for browser verification',
  Smols: tracks,
  Address: address,
  Created_At: '2025-10-01',
};
const list = { smols: tracks, users: [artist], pagination: { hasMore: false, nextCursor: null } };
const routes = new Map([
  ['/__ready', {}],
  ['/', list],
  ['/artists/fixture-artist/smols', { ...list, artist }],
  ['/mixtapes', [{ ...mixtape, Smols: Smols.map((track) => track.Id) }]],
  ['/mixtapes/fixture-mixtape', { ...mixtape, Smols }],
  ['/search/first-smol/similar', { results: [] }],
  ['/likes', []],
  ['/first-smol', {
    d1: tracks[0],
    kv_do: {
      lyrics: { title: tracks[0].Title },
      songs: [
        { music_id: 'first', status: 4 },
        { music_id: 'alternate', status: 4, audio: 'http://127.0.0.1:4329/song/alternate-fallback.mp3' },
      ],
    },
  }],
]);

const requests = new Map();
createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const headers = {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:4328',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (path.startsWith('/image/')) {
    res.writeHead(200, { ...headers, 'Content-Type': 'image/png' }).end(cover);
    return;
  }

  const data = path === '/__requests' ? Object.fromEntries(requests) : routes.get(path);
  if (path === '/__reset') {
    requests.clear();
    res.writeHead(200).end();
    return;
  }

  requests.set(path, (requests.get(path) ?? 0) + 1);
  res.writeHead(data === undefined ? 404 : 200, { ...headers, 'Content-Type': 'application/json' })
    .end(JSON.stringify(data ?? {}));
}).listen(4329, '127.0.0.1');
