const DROP_PARAMS = new Set([
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "fbclid", "ref", "ref_src", "src",
    "sort", "filter", "view", "session", "debug", "shuffle", "play", "from"
]);

const KEEP_PARAMS_FOR_INDEX = new Set([
    "page"
]);

export function buildCanonical(inputUrl: URL, siteOrigin: string): string {
    // Ensure we use the desired origin
    const u = new URL(inputUrl.pathname, siteOrigin);

    // Only keep whitelisted params
    const params = new URLSearchParams(inputUrl.search);
    for (const [k, v] of params.entries()) {
        if (DROP_PARAMS.has(k)) continue;
        if (KEEP_PARAMS_FOR_INDEX.has(k)) u.searchParams.set(k, v);
    }

    // Determine if we should retain any params or if this is clean content
    // Most of our content is just path-based.
    return u.toString();
}

export function robotsMetaForUrl(inputUrl: URL): string {
    const params = new URLSearchParams(inputUrl.search);
    // If we have params that aren't for pagination, likely noindex this variant
    for (const k of params.keys()) {
        if (!KEEP_PARAMS_FOR_INDEX.has(k)) return "noindex,follow";
    }
    return "index,follow";
}

export function jsonLd<T>(obj: T): string {
    return JSON.stringify(obj, null, 0);
}
