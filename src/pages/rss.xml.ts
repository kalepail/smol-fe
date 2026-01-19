import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
  const SITE_URL = "https://noot.smol.xyz";

  try {
    // Fetch latest public songs (limit to 50 for RSS best practices)
    // This assumes there's an API endpoint that returns latest songs
    // If not available, we'll use a static/sample feed

    const items: string[] = [];

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

    <!-- RSS items would go here -->
    <!-- Since we don't have a direct API endpoint for latest songs in this context, -->
    <!-- this is a placeholder structure. In production, you'd fetch from API -->

    <item>
      <title>Latest AI Music on Smol</title>
      <link>${SITE_URL}</link>
      <description>Discover the latest AI-generated songs. Create your own music from text prompts, mint as NFTs, and collect music onchain.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid isPermaLink="true">${SITE_URL}</guid>
    </item>

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
