import type { MiddlewareHandler } from "astro";

const INDEXABLE_PREFIXES = [
    "/song/",
    "/mixtape/",
    "/tags/",
    "/ai-music/",
    "/prompts/",
    "/onchain/",
    "/artist/"
];

// Special handling for the distinct [id] route which serves as "song" pages at root or logic
// Actually, our routes are just `https://noot.smol.xyz/[id]`. 
// So we need to be careful not to cache 404s or non-content wildly.
// But the plan suggests indexable prefixes. 
// Note: `src/pages/[id].astro` handles songs. So `/abc` is a song. 
// We should probably cache aggressively on success.

export const onRequest: MiddlewareHandler = async (ctx, next) => {
    const res = await next();
    const url = new URL(ctx.request.url); // specific to Astro/Cloudflare context or just ctx.url? 
    // ctx.url is URL object in Astro.

    const host = url.hostname;

    // 1) Prevent preview deployments from being indexed (EXCEPT embed routes or Social Bots)
    const ua = ctx.request.headers.get("user-agent") || "";
    const isSocialBot = /Twitterbot|facebookexternalhit|Discordbot/i.test(ua);

    if (host.endsWith(".pages.dev") && !url.pathname.startsWith('/embed/') && !isSocialBot) {
        res.headers.set("X-Robots-Tag", "noindex");
        return res;
    }

    // 2) Allow embed routes to be loaded in iframes from any origin (required for Twitter/Discord player cards)
    if (url.pathname.startsWith('/embed/')) {
        // Remove any restrictive X-Frame-Options
        res.headers.delete("X-Frame-Options");
        // Allow framing from anywhere (required for Twitter mobile, Discord, etc.)
        res.headers.set("Content-Security-Policy", "frame-ancestors *");
        // Cross-origin isolation for media playback
        res.headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");
        res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    }

    // 2) Cache HTML at the edge for public indexable routes AND generic root IDs (songs)
    // Our song routes are at root `/[id]`, so we can't easily adhere to `/song/` prefix restriction purely.
    // We can check if it looks like a resource or a page.
    // For now, let's trust the whitelist + root ID logic if needed, 
    // but strictly following the "Nuclear Plan" which used `/song/` might be a disconnect from my actual `[id].astro`.

    // Pivot: The Plan assumes `/song/`. My App uses `/[id]`.
    // I should adapt the plan to caching specific paths or just cache everything that isn't API?
    // Let's stick to explicit knowns for now + root IDs if they match a pattern?
    // Actually, simplest safe bet: If it's NOT an API/Auth route, cache it briefly?
    // Let's use the explicit prefixes for now, and add dynamic logic if I move routes.
    // Wait, I *AM* using `[id].astro` for songs. So `noot.smol.xyz/abc` is a song. 
    // I should add logic to cache root paths too?
    // Risk: Caching user pages or dynamic states. 
    // Safe bet: stick to the explicitly safe prefixes for aggressive caching, and maybe standard caching for others.

    const isIndexable = INDEXABLE_PREFIXES.some((p) => url.pathname.startsWith(p)) ||
        (url.pathname.split('/').length === 2 && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/_'));

    if (isIndexable) {
        // Browser: always revalidate (avoid stale SEO tags)
        res.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
        // CDN: short TTL (5 mins) + SWR (1 day)
        res.headers.set("CDN-Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
    }

    return res;
};
