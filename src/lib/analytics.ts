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

/**
 * GEO Analytics: Track AI referrers for visibility measurement
 * Detects traffic from ChatGPT, Perplexity, Claude, Gemini, Bing Copilot, etc.
 */
export function trackAIReferrer() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    try {
        const referrer = document.referrer.toLowerCase();

        // Known AI engine domains
        const aiReferrers = {
            'chatgpt.com': 'ChatGPT',
            'chat.openai.com': 'ChatGPT',
            'perplexity.ai': 'Perplexity',
            'claude.ai': 'Claude',
            'gemini.google.com': 'Gemini',
            'bard.google.com': 'Gemini',
            'bing.com/chat': 'Bing Copilot',
            'copilot.microsoft.com': 'Microsoft Copilot',
            'you.com': 'You.com AI',
        };

        let detectedAI: string | null = null;

        for (const [domain, name] of Object.entries(aiReferrers)) {
            if (referrer.includes(domain)) {
                detectedAI = name;
                break;
            }
        }

        if (detectedAI) {
            // Store in localStorage for visibility benchmarking
            const aiVisits = JSON.parse(localStorage.getItem('smol_ai_visits') || '[]');
            aiVisits.push({
                source: detectedAI,
                timestamp: new Date().toISOString(),
                page: window.location.pathname,
                referrer: document.referrer,
            });
            // Keep last 100 AI visits
            if (aiVisits.length > 100) aiVisits.shift();
            localStorage.setItem('smol_ai_visits', JSON.stringify(aiVisits));

            console.log('[GEO] AI Referrer Detected:', detectedAI, document.referrer);
        }
    } catch (error) {
        console.error('AI referrer tracking error:', error);
    }
}

/**
 * Get AI visibility metrics from localStorage
 */
export function getAIVisibilityMetrics() {
    try {
        const aiVisits = JSON.parse(localStorage.getItem('smol_ai_visits') || '[]');

        // Aggregate by source
        const bySource: Record<string, number> = {};
        aiVisits.forEach((visit: any) => {
            bySource[visit.source] = (bySource[visit.source] || 0) + 1;
        });

        return {
            totalAIVisits: aiVisits.length,
            bySource,
            recentVisits: aiVisits.slice(-10),
        };
    } catch {
        return { totalAIVisits: 0, bySource: {}, recentVisits: [] };
    }
}
