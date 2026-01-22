import type { APIRoute } from 'astro';

const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

export const GET: APIRoute = async ({ url, request }) => {
    const targetUrl = url.searchParams.get('url');
    const format = url.searchParams.get('format') || 'json';

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Parse the song ID from the URL
    // Expected format: https://domain.com/{id} or https://domain.com/embed/{id}
    const urlMatch = targetUrl.match(/\/([a-f0-9]{64})(?:\/|$)/i) ||
        targetUrl.match(/\/embed\/([a-f0-9]{64})(?:\/|$)/i);

    if (!urlMatch) {
        return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const songId = urlMatch[1];

    // Fetch song data
    let title = "Smol Song";
    let author = "Smol Artist";
    let thumbnailUrl = `${API_URL}/meta.png`;

    try {
        const res = await fetch(`${API_URL}/${songId}`, {
            headers: {
                "User-Agent": "SmolBot/1.0",
                "Accept": "application/json"
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (data) {
                title = data.kv_do?.lyrics?.title || data.d1?.Title || "Untitled";
                author = data.d1?.Creator || data.d1?.Address?.slice(0, 8) || "Smol Artist";
                thumbnailUrl = `${API_URL}/image/${songId}.png?scale=16`;
            }
        }
    } catch (e) {
        console.error("oEmbed data fetch failed:", e);
    }

    // Determine the origin for embed URLs
    const origin = new URL(request.url).origin;
    const embedUrl = `${origin}/embed/${songId}`;

    // Build oEmbed response
    // Using "rich" type with html iframe for Discord
    const oembedResponse = {
        version: "1.0",
        type: "rich",
        title: title,
        author_name: author,
        author_url: `${origin}`,
        provider_name: "Smol",
        provider_url: "https://smol.xyz",
        thumbnail_url: thumbnailUrl,
        thumbnail_width: 480,
        thumbnail_height: 480,
        width: 480,
        height: 480,
        html: `<iframe src="${embedUrl}" width="480" height="480" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`
    };

    if (format === 'xml') {
        // XML format (rarely used but part of spec)
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<oembed>
    <version>1.0</version>
    <type>rich</type>
    <title>${escapeXml(title)}</title>
    <author_name>${escapeXml(author)}</author_name>
    <provider_name>Smol</provider_name>
    <provider_url>https://smol.xyz</provider_url>
    <thumbnail_url>${escapeXml(thumbnailUrl)}</thumbnail_url>
    <thumbnail_width>480</thumbnail_width>
    <thumbnail_height>480</thumbnail_height>
    <width>480</width>
    <height>480</height>
    <html>${escapeXml(oembedResponse.html)}</html>
</oembed>`;
        return new Response(xml, {
            headers: { 'Content-Type': 'text/xml; charset=utf-8' }
        });
    }

    return new Response(JSON.stringify(oembedResponse), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600'
        }
    });
};

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
