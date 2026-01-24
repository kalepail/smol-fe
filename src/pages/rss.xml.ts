import type { APIRoute } from 'astro';
import { fetchSmols } from '../services/api/smols';

export const GET: APIRoute = async ({ request }) => {
  const SITE_URL = "https://noot.smol.xyz";

  try {
    // Fetch latest 50 songs
    // We use the shared service which handles fallback to snapshot if API fails
    const smols = await fetchSmols({ limit: 50 });

    // Sort by creation date descending just in case
    // The API usually returns latest first, but good to be safe if snapshot fallback is used
    const sorted = smols.sort((a, b) => {
      const dateA = new Date(a.Created_At || 0).getTime();
      const dateB = new Date(b.Created_At || 0).getTime();
      return dateB - dateA;
    }).slice(0, 50);

    const items = sorted.map(smol => {
      // Safe data extraction
      const title = smol.kv_do?.lyrics?.title || smol.Title || `Song ${smol.Id.slice(0, 8)}`;
      const prompt = smol.kv_do?.payload?.prompt || smol.kv_do?.description || "AI generated song";
      // XML Escape the content? Simple replacements for now.
      const cleanTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const cleanDesc = prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Date
      const dateStr = smol.Created_At || new Date().toISOString();
      const date = new Date(dateStr).toUTCString();

      return `<item>
      <title>${cleanTitle}</title>
      <link>${SITE_URL}/${smol.Id}</link>
      <description>${cleanDesc}</description>
      <pubDate>${date}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/${smol.Id}</guid>
    </item>`;
    }).join('\n');

    // RSS header
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Smol — Latest AI Music</title>
    <link>${SITE_URL}</link>
    <description>Latest AI-generated songs on Smol. Create and collect music onchain.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/favicon.png</url>
      <title>Smol</title>
      <link>${SITE_URL}</link>
    </image>
    ${items}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('RSS feed error:', error);

    // Fallback minimal RSS if API fails
    const fallbackRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Smol — AI Music</title>
    <link>${SITE_URL}</link>
    <description>AI-generated music on Stellar blockchain</description>
    <item>
      <title>Smol AI Music</title>
      <link>${SITE_URL}</link>
      <description>Visit Smol to discover AI-generated music</description>
    </item>
  </channel>
</rss>`;

    return new Response(fallbackRss, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  }
};
