import type { APIRoute } from 'astro';
import { fetchSmols } from '../services/api/smols';

export const GET: APIRoute = async ({ request }) => {
    const SITE_URL = "https://noot.smol.xyz";

    try {
        // Fetch top 5000 songs to ensure deep coverage
        const smols = await fetchSmols({ limit: 5000 });

        const items = smols.map(smol => {
            const lastMod = smol.d1?.Created || smol.Created_At || new Date().toISOString();
            // Remove milliseconds for cleaner sitemap date
            const date = new Date(lastMod).toISOString().split('T')[0];

            return `  <url>
    <loc>${SITE_URL}/${smol.Id}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        }).join('\n');

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;

        return new Response(sitemap, {
            headers: {
                'Content-Type': 'application/xml',
                'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
            },
        });
    } catch (error) {
        console.error('Sitemap generation error:', error);
        return new Response('Error generating sitemap', { status: 500 });
    }
};
