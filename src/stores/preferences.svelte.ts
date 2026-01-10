
/**
 * UI Preferences Store using Svelte 5 runes
 * Persists render settings to localStorage
 */

export type GlowTheme = 'technicolor_v2' | 'neural' | 'red' | 'green' | 'blue' | 'holiday' | 'halloween' | 'usa' | 'valentine' | 'slate' | 'kale';

// Type definitions for state parameters
type UserState = {
    contractId: string | null;
    keyId: string | null;
    walletConnected: boolean;
} | null;

type UpgradesState = {
    premiumHeader: boolean;
    goldenKale: boolean;
    showcaseReel: boolean;
    vibeMatrix: boolean;
} | null;

const DEFAULT_PREFERENCES = {
    renderMode: 'thinking' as 'fast' | 'thinking',
    glowTheme: 'slate' as GlowTheme,
    unlockedThemes: [] as string[]
};

/**
 * Centralized theme gating function - SINGLE SOURCE OF TRUTH
 * Returns true if user can use the specified theme, false otherwise.
 * Default DENY for locked themes unless explicitly proven eligible.
 */
export function canUseTheme(
    themeId: GlowTheme,
    userState: UserState,
    upgradesState: UpgradesState,
    unlockedThemes: string[] = []
): boolean {
    // Always allow base themes (no restrictions)
    const baseThemes: GlowTheme[] = ['slate', 'neural', 'red', 'green', 'blue', 'kale', 'technicolor_v2'];
    if (baseThemes.includes(themeId)) {
        return true;
    }

    // LOCKED THEME: holiday - requires login
    if (themeId === 'holiday') {
        return !!(userState?.contractId);
    }

    // LOCKED THEME: halloween (Spooky Season) - GOLDEN KALE HOLDERS ONLY
    // Default DENY unless explicitly proven they own goldenKale upgrade
    if (themeId === 'halloween') {
        // Strict check: upgradesState must exist AND goldenKale must be explicitly true
        return !!(upgradesState?.goldenKale === true);
    }

    // LOCKED THEME: valentine - limited time event unlock
    if (themeId === 'valentine') {
        return unlockedThemes.includes('valentine_2026');
    }

    // Unknown theme - default deny for safety
    return false;
}

function loadPreferences() {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
    try {
        const stored = localStorage.getItem('smol_preferences');
        if (stored) {
            const parsed = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };

            // Migrate old 'technicolor' or 'technicolor_v2' to 'slate' at load time
            if (parsed.glowTheme === 'technicolor' as any || parsed.glowTheme === 'technicolor_v2') {
                parsed.glowTheme = 'slate';
                console.log('[Preferences] Migrating technicolor → slate');
            }

            return parsed;
        }
    } catch (e) {
        console.warn('Failed to load preferences', e);
    }
    return DEFAULT_PREFERENCES;
}

export const preferences = $state(loadPreferences());

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
 * Safely set theme with eligibility check.
 * Reverts to slate if user is not eligible for the requested theme.
 */
export function setTheme(
    themeId: GlowTheme,
    userState: UserState,
    upgradesState: UpgradesState,
    unlockedThemes: string[] = []
): void {
    if (canUseTheme(themeId, userState, upgradesState, unlockedThemes)) {
        preferences.glowTheme = themeId;
    } else {
        console.warn(`[Preferences] Theme '${themeId}' is locked. Reverting to slate.`);
        preferences.glowTheme = 'slate';
    }
}

/**
 * Validate current theme and revert if no longer eligible.
 * Call this when user state or upgrades state changes.
 */
export function validateAndRevertTheme(
    userState: UserState,
    upgradesState: UpgradesState,
    unlockedThemes: string[] = []
): void {
    const currentTheme = preferences.glowTheme;
    if (!canUseTheme(currentTheme, userState, upgradesState, unlockedThemes)) {
        console.warn(`[Preferences] Current theme '${currentTheme}' is no longer eligible. Reverting to slate.`);
        preferences.glowTheme = 'slate';
    }
}

$effect.root(() => {
    $effect(() => {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('smol_preferences', JSON.stringify({
                renderMode: preferences.renderMode,
                glowTheme: preferences.glowTheme,
                unlockedThemes: preferences.unlockedThemes || []
            }));
        }
    });
});
