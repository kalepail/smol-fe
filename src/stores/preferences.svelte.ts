
/**
 * UI Preferences Store using Svelte 5 runes
 * Persists render settings to localStorage
 */

export type GlowTheme = 'technicolor_v2' | 'neural' | 'red' | 'green' | 'blue' | 'holiday' | 'halloween' | 'usa' | 'valentine' | 'slate' | 'kale';

const DEFAULT_PREFERENCES = {
    renderMode: 'thinking' as 'fast' | 'thinking',
    glowTheme: 'slate' as GlowTheme,
    unlockedThemes: [] as string[]
};

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
