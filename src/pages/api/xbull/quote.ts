
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.toString();
    const targetUrl = `https://swap.apis.xbull.app/swaps/quote?${query}`;

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Failed to fetch quote from xBull' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
};
