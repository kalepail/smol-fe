
/**
 * UI Preferences Store using Svelte 5 runes
 * Persists render settings to localStorage
 *
 * SECURITY: Theme writes are protected. Use setTheme() only.
 */

export type GlowTheme = 'technicolor_v2' | 'neural' | 'red' | 'green' | 'blue' | 'holiday' | 'halloween' | 'usa' | 'valentine' | 'slate' | 'kale';

// Entitlement context for theme gating
type EntitlementCtx = {
    user: { contractId: string | null } | null;
    upgrades: { goldenKale: boolean } | null;
    unlocks: string[];
};

// Theme catalog with requirements (centralized metadata)
type ThemeRequirement = 'none' | 'login' | 'golden_kale' | 'valentine_2026';
const THEME_CATALOG: Record<GlowTheme, { req: ThemeRequirement }> = {
    slate: { req: 'none' },
    neural: { req: 'none' },
    red: { req: 'none' },
    green: { req: 'none' },
    blue: { req: 'none' },
    kale: { req: 'none' },
    technicolor_v2: { req: 'none' },
    holiday: { req: 'login' },
    halloween: { req: 'golden_kale' },
    valentine: { req: 'valentine_2026' },
    usa: { req: 'none' },
};

const FALLBACK_THEME: GlowTheme = 'slate';
const DEFAULT_PREFERENCES = {
    renderMode: 'thinking' as 'fast' | 'thinking',
    glowTheme: FALLBACK_THEME,
    unlockedThemes: [] as string[]
};

/**
 * Check if user meets requirement for a theme
 * Default DENY for locked themes unless explicitly proven eligible.
 */
function meetsRequirement(req: ThemeRequirement, ctx: EntitlementCtx): boolean {
    if (req === 'none') return true;
    if (req === 'login') return !!ctx.user?.contractId;
    if (req === 'golden_kale') return ctx.upgrades?.goldenKale === true;
    if (req === 'valentine_2026') return ctx.unlocks.includes('valentine_2026');
    return false; // Unknown requirement = deny
}

/**
 * Centralized theme gating - SINGLE SOURCE OF TRUTH
 */
export function canUseTheme(id: GlowTheme, ctx: EntitlementCtx): boolean {
    const entry = THEME_CATALOG[id];
    if (!entry) return false; // Unknown theme = deny
    return meetsRequirement(entry.req, ctx);
}

/**
 * Sanitize theme ID: return id if entitled, else fallback
 */
function sanitizeTheme(id: GlowTheme, ctx: EntitlementCtx): GlowTheme {
    return canUseTheme(id, ctx) ? id : FALLBACK_THEME;
}

function loadPreferences() {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
    try {
        const stored = localStorage.getItem('smol_preferences');
        if (stored) {
            const parsed = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };

            // Migrate legacy technicolor to slate
            if (parsed.glowTheme === 'technicolor' as any) {
                parsed.glowTheme = FALLBACK_THEME;
                console.log('[Preferences] Migrated technicolor → slate');
            }

            // Sanitize loaded theme (default deny for tampered localStorage)
            // NOTE: At load time we don't have entitlement context yet, so we
            // allow the value through. It will be validated on first state change.
            return parsed;
        }
    } catch (e) {
        console.warn('[Preferences] Load failed, using defaults:', e);
    }
    return DEFAULT_PREFERENCES;
}

// Internal state - DO NOT export for direct mutation
const _prefs = $state(loadPreferences());

// Public read-only accessor
export const preferences = {
    get renderMode() { return _prefs.renderMode; },
    get glowTheme() { return _prefs.glowTheme; },
    get unlockedThemes() { return _prefs.unlockedThemes; },
};

// Derived helpers for themes
export const THEMES: Record<GlowTheme, { name: string, gradient: string, color: string, style?: string }> = {
    technicolor_v2: {
        name: 'Technicolor',
        gradient: 'from-purple-500 via-pink-500 to-orange-500',
        color: '#a855f7',
        style: 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);'
    },
    neural: {
        name: 'Neural',
        gradient: 'from-emerald-500 via-purple-500 to-orange-500',
        color: '#10b981'
    },
    red: {
        name: 'Crimson Tide',
        gradient: 'from-red-600 via-red-500 to-red-400',
        color: '#ef4444'
    },
    green: {
        name: 'Matrix Flow',
        gradient: 'from-green-600 via-green-500 to-lime-400',
        color: '#22c55e'
    },
    blue: {
        name: 'Cyber Blue',
        gradient: 'from-blue-600 via-cyan-500 to-indigo-400',
        color: '#3b82f6'
    },
    holiday: {
        name: 'Holiday Glowpack',
        gradient: 'from-red-600 via-green-500 to-yellow-400',
        color: '#ef4444'
    },
    halloween: {
        name: 'Spooky Season',
        gradient: 'from-orange-500 via-purple-600 to-black',
        color: '#f97316'
    },
    usa: {
        name: 'Liberty',
        gradient: 'from-blue-600 via-white to-red-600',
        color: '#3b82f6'
    },
    valentine: {
        name: "Valentine's ❤️",
        gradient: 'from-pink-500 via-red-500 to-purple-500',
        color: '#ec4899',
        style: 'background-image: url("/images/valentine_hearts.png"); background-size: cover;'
    },
    slate: {
        name: 'Solid Slate',
        gradient: 'from-green-500 via-lime-500 to-emerald-500',
        color: '#10b981',
        style: 'background-color: #1D293D;'
    },
    kale: {
        name: 'Kale Field',
        gradient: 'from-green-400 via-emerald-500 to-teal-400',
        color: '#10b981',
        style: 'background-image: url("/images/kale-field-bg.png"); background-size: cover;'
    }
};

/**
 * ONLY way to set theme. Enforces entitlement check + persists.
 */
export function setTheme(
    id: GlowTheme,
    user: { contractId: string | null } | null,
    upgrades: { goldenKale: boolean } | null,
    unlocks: string[] = []
): void {
    const ctx: EntitlementCtx = { user, upgrades, unlocks };
    const safe = sanitizeTheme(id, ctx);
    if (safe !== id) {
        console.warn(`[Theme] '${id}' locked, reverted to '${safe}'`);
    }
    _prefs.glowTheme = safe;
}

/**
 * Validate and sanitize current theme based on entitlements.
 * Call when user/upgrades/unlocks change.
 */
export function validateAndRevertTheme(
    user: { contractId: string | null } | null,
    upgrades: { goldenKale: boolean } | null,
    unlocks: string[] = []
): void {
    const ctx: EntitlementCtx = { user, upgrades, unlocks };
    const current = _prefs.glowTheme;
    const safe = sanitizeTheme(current, ctx);
    if (safe !== current) {
        console.warn(`[Theme] '${current}' no longer entitled, reverted to '${safe}'`);
        _prefs.glowTheme = safe;
    }
}

/**
 * Set render mode (no gating needed)
 */
export function setRenderMode(mode: 'fast' | 'thinking'): void {
    _prefs.renderMode = mode;
}

// Auto-persist to localStorage on changes
$effect.root(() => {
    $effect(() => {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('smol_preferences', JSON.stringify({
                renderMode: _prefs.renderMode,
                glowTheme: _prefs.glowTheme,
                unlockedThemes: _prefs.unlockedThemes || []
            }));
        }
    });
});
