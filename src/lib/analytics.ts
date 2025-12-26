/**
 * Lightweight Client-Side Analytics
 * 
 * Currently logs views to localStorage to simulate history/analytics.
 * effectively "Invisible" to the user as requested.
 * 
 * Future: Hook this up to a real backend for global popularity sorting.
 */

const STORAGE_KEY_VIEWS = 'smol_analytics_views';

export function trackView(smolId: string) {
    if (!smolId) return;

    try {
        // 1. Get existing data
        const raw = localStorage.getItem(STORAGE_KEY_VIEWS);
        const data = raw ? JSON.parse(raw) : {};

        // 2. Increment count (locally)
        data[smolId] = (data[smolId] || 0) + 1;

        // 3. Save back
        localStorage.setItem(STORAGE_KEY_VIEWS, JSON.stringify(data));

        // 4. Debug log (optional, for verification)
        // console.log(`[Analytics] Tracked view for ${smolId}. Total local views: ${data[smolId]}`);
    } catch (e) {
        console.warn("[Analytics] Failed to track view", e);
    }
}

export function getLocalViewCount(smolId: string): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_VIEWS);
        const data = raw ? JSON.parse(raw) : {};
        return data[smolId] || 0;
    } catch {
        return 0;
    }
}
