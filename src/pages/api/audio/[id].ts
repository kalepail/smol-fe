import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, request }) => {
    const { id } = params;

    if (!id) {
        return new Response('Missing audio ID', { status: 400 });
    }

    // Bot detection for social previews
    // If a bot requests the audio directly, redirect to the song page to show the player card
    const ua = request.headers.get('user-agent')?.toLowerCase() || '';
    const isBot = /bot|facebook|twitter|discord|telegram|whatsapp|slack/i.test(ua);

    // Clean ID: remove .mp3 extension if present, then sanitize
    const rawId = id.endsWith('.mp3') ? id.slice(0, -4) : id;
    const safeId = rawId.replace(/[^a-zA-Z0-9-]/g, '');

    if (isBot) {
        // Redirect bots to the main song page which has the meta tags
        const siteUrl = import.meta.env.PUBLIC_URL || 'https://noot.smol.xyz';
        return new Response(null, {
            status: 302,
            headers: {
                'Location': `${siteUrl}/${safeId}`
            }
        });
    }

    if (safeId !== rawId || safeId.length > 64) {
        return new Response('Invalid ID format', { status: 400 });
    }

    // Construct upstream URL (defaulting to api.smol.xyz if env not set)
    // Note: We use the .mp3 extension as that's what the backend expects
    const baseUrl = import.meta.env.PUBLIC_API_URL || 'https://api.smol.xyz';
    const upstreamUrl = `${baseUrl}/song/${safeId}.mp3`;

    try {
        // CRITICAL for Chromecast: Forward Range header if present
        const rangeHeader = request.headers.get('Range');
        const upstreamHeaders: HeadersInit = {};
        if (rangeHeader) {
            upstreamHeaders['Range'] = rangeHeader;
        }

        const response = await fetch(upstreamUrl, {
            headers: upstreamHeaders
        });

        if (!response.ok) {
            return new Response(`Upstream error: ${response.status}`, { status: response.status });
        }

        // Build response headers
        const responseHeaders: HeadersInit = {
            'Content-Type': 'audio/mpeg',
            // KEY FIX: Force permissive CORS for Cast Receiver
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
            'Cache-Control': 'public, max-age=3600',
            // CRITICAL for Chromecast: Always advertise Range support
            'Accept-Ranges': 'bytes'
        };

        // Forward Content-Length if available
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders['Content-Length'] = contentLength;
        }

        // Forward Content-Range for partial content responses (206)
        const contentRange = response.headers.get('Content-Range');
        if (contentRange) {
            responseHeaders['Content-Range'] = contentRange;
        }

        // Create a new response with the body stream
        // Status must match upstream (200 for full content, 206 for partial)
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

    } catch (e) {
        console.error('Audio proxy error:', e);
        return new Response('Audio fetch failed', { status: 502 });
    }
}

// Handle HEAD requests (Chromecast may check file size first)
export const HEAD: APIRoute = async ({ params }) => {
    const { id } = params;

    if (!id) {
        return new Response(null, { status: 400 });
    }

    const baseUrl = import.meta.env.PUBLIC_API_URL || 'https://api.smol.xyz';
    const upstreamUrl = `${baseUrl}/song/${id}.mp3`;

    try {
        const response = await fetch(upstreamUrl, { method: 'HEAD' });

        if (!response.ok) {
            return new Response(null, { status: response.status });
        }

        const responseHeaders: HeadersInit = {
            'Content-Type': 'audio/mpeg',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
            'Cache-Control': 'public, max-age=3600',
            'Accept-Ranges': 'bytes'
        };

        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders['Content-Length'] = contentLength;
        }

        return new Response(null, {
            status: 200,
            headers: responseHeaders
        });

    } catch (e) {
        console.error('Audio proxy HEAD error:', e);
        return new Response(null, { status: 502 });
    }
};

// Handle OPTIONS preflight for CORS
export const OPTIONS: APIRoute = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '86400'
        }
    });
};
