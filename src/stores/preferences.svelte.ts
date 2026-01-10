
/**
 * UI Preferences Store using Svelte 5 runes
 * Persists render settings to localStorage
 */

export type GlowTheme = 'technicolor' | 'neural' | 'red' | 'green' | 'blue' | 'holiday' | 'halloween' | 'usa' | 'valentine' | 'slate' | 'kale';

const DEFAULT_PREFERENCES = {
    renderMode: 'thinking' as 'fast' | 'thinking',
    glowTheme: 'technicolor' as GlowTheme,
    unlockedThemes: [] as string[]
};

function loadPreferences() {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
    try {
        const stored = localStorage.getItem('smol_preferences');
        if (stored) {
            return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.warn('Failed to load preferences', e);
    }
    return DEFAULT_PREFERENCES;
}

export const preferences = $state(loadPreferences());

// Derived helpers for themes
export const THEMES: Record<GlowTheme, { name: string, gradient: string, color: string, style?: string }> = {
    technicolor: {
        name: 'Technicolor',
        gradient: '',
        color: '#f59e0b',
        style: 'background: conic-gradient(from 0deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff, #8000ff, #ff00ff, #ff0000)'
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
        gradient: 'from-slate-700 via-slate-600 to-slate-500',
        color: '#475569',
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
