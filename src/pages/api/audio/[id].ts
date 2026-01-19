import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, request }) => {
    const { id } = params;

    if (!id) {
        return new Response('Missing audio ID', { status: 400 });
    }

    // Construct upstream URL (defaulting to api.smol.xyz if env not set)
    // Note: We use the .mp3 extension as that's what the backend expects
    const baseUrl = import.meta.env.PUBLIC_API_URL || 'https://api.smol.xyz';
    const upstreamUrl = `${baseUrl}/song/${id}.mp3`;

    try {
        const response = await fetch(upstreamUrl);

        if (!response.ok) {
            return new Response(`Upstream error: ${response.status}`, { status: response.status });
        }

        // specific handling for 503s is implicitly covered above (response.ok is false)

        // Create a new response with the body stream
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: {
                'Content-Type': 'audio/mpeg',
                // KEY FIX: Force permissive CORS for Cast Receiver
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
                // Forward content-length if available for progress bars
                ...(response.headers.get('content-length') && { 'Content-Length': response.headers.get('content-length')! })
            }
        });

    } catch (e) {
        console.error('Audio proxy error:', e);
        return new Response('Audio fetch failed', { status: 502 });
    }
}
