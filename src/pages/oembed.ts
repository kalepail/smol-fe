import type { APIRoute } from 'astro';
import { serverApiFetchResult } from '../services/api/ssr';
import type { SmolDetailResponse } from '../types/domain';
import { songSafety } from '../utils/songSafety';

const SONG_ID_RE = /^\/([0-9a-f]{64})\/?$/i;
const DEFAULT_SIDE = 480;
const BASE_COVER_PX = 64;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseOptionalMaxDim(raw: string | null): number | null | 'invalid' {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return 'invalid';
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return 'invalid';
  return n;
}

function jsonResponse(body: Record<string, unknown>, status: number, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const GET: APIRoute = async (context) => {
  const { url } = context;
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  if (format !== 'json') {
    return jsonResponse({ error: 'Only JSON oEmbed format is supported' }, 501);
  }

  const targetRaw = url.searchParams.get('url');
  if (!targetRaw) {
    return jsonResponse({ error: 'Missing required url parameter' }, 400);
  }

  const maxWidth = parseOptionalMaxDim(url.searchParams.get('maxwidth'));
  const maxHeight = parseOptionalMaxDim(url.searchParams.get('maxheight'));
  if (maxWidth === 'invalid' || maxHeight === 'invalid') {
    return jsonResponse({ error: 'Invalid maxwidth or maxheight parameter' }, 400);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(targetRaw);
  } catch {
    return jsonResponse({ error: 'Invalid url parameter' }, 400);
  }

  const allowedHosts = new Set(['smol.xyz', 'www.smol.xyz', url.hostname]);
  if ((targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') || !allowedHosts.has(targetUrl.hostname)) {
    return jsonResponse({ error: 'Unsupported URL host' }, 404);
  }

  const match = SONG_ID_RE.exec(targetUrl.pathname);
  if (!match) {
    return jsonResponse({ error: 'Song not found' }, 404);
  }

  const id = match[1];
  const result = await serverApiFetchResult<SmolDetailResponse>(
    { request: context.request, cookies: context.cookies, response: { headers: new Headers() } },
    `/${encodeURIComponent(id)}?no_view=1`
  );

  if (result.status === 0 || result.status >= 500) {
    return jsonResponse({ error: 'Upstream unavailable' }, 503);
  }

  const data = result.status === 200 ? result.data : null;
  const firstReady = data?.kv_do?.songs?.[0];
  const resolvedMusicId =
    data?.d1?.Song_1 || (firstReady && firstReady.status >= 4 && firstReady.music_id ? firstReady.music_id : null);

  if (!data?.d1 || !resolvedMusicId || songSafety(data.kv_do?.nsfw).restricted) {
    return jsonResponse({ error: 'Song not found' }, 404);
  }

  const title = data.kv_do?.lyrics?.title || data.d1.Title || 'SMOL Song';
  const apiUrl = import.meta.env.PUBLIC_API_URL.replace(/\/+$/, '');
  const origin = url.origin;

  // Strictly honor consumer maxwidth and maxheight bounds (oEmbed 2.2 / 2.3).
  const width = maxWidth !== null ? Math.min(DEFAULT_SIDE, maxWidth) : DEFAULT_SIDE;
  const height = maxHeight !== null ? Math.min(DEFAULT_SIDE, maxHeight) : DEFAULT_SIDE;
  const side = Math.min(width, height);

  const embedSrc = `${origin}/embed/${id}`;
  const artistAddress = data.d1.Address || data.kv_do?.payload?.address || null;
  const artistName = data.d1.Username || data.d1.Creator || data.d1.artist || data.d1.author || null;

  const payload: Record<string, unknown> = {
    version: '1.0',
    type: 'video',
    provider_name: 'SMOL',
    provider_url: origin,
    title,
    width: side,
    height: side,
    html: `<iframe src="${escapeAttr(embedSrc)}" width="${side}" height="${side}" frameborder="0" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="${escapeAttr(title)}"></iframe>`,
  };

  // Scale thumbnail to fit within consumer bounds; omit if bounds are smaller than base cover (64px).
  const maxThumb = Math.min(maxWidth ?? 1024, maxHeight ?? 1024);
  const thumbScale = Math.min(16, Math.floor(maxThumb / BASE_COVER_PX));
  if (thumbScale >= 1) {
    const thumbSide = BASE_COVER_PX * thumbScale;
    payload.thumbnail_url = `${apiUrl}/image/${id}.png?scale=${thumbScale}`;
    payload.thumbnail_width = thumbSide;
    payload.thumbnail_height = thumbSide;
  }

  if (artistName) {
    payload.author_name = artistName;
    if (artistAddress) {
      payload.author_url = `${origin}/artists/${encodeURIComponent(artistAddress)}`;
    }
  }

  return jsonResponse(payload, 200, 'public, max-age=300');
};
