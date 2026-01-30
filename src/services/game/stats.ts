
export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string;
    condition: (stats: GameStats) => boolean;
}

export interface SongInteraction {
    songId: string;
    action: 'kale' | 'fail';
    amount?: number;
    timestamp: number;
}

export interface GameStats {
    totalTips: number;
    totalSkips: number;
    totalKaleSent: number;
    currentStreak: number; // Positive for KALE, Negative for FAIL
    maxKaleStreak: number;
    maxFailStreak: number;
    songsPlayed: number;
    unlockedAchievements: string[];
    history: Record<string, SongInteraction>; // songId -> interaction
}

const STORAGE_KEY = 'smol_kof_stats_v1';

const INITIAL_STATS: GameStats = {
    totalTips: 0,
    totalSkips: 0,
    totalKaleSent: 0,
    currentStreak: 0,
    maxKaleStreak: 0,
    maxFailStreak: 0,
    songsPlayed: 0,
    unlockedAchievements: [],
    history: {}
};

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'first_kale',
        title: 'First Kale',
        description: 'Sent your first tip!',
        icon: '🥬',
        condition: (s) => s.totalTips >= 1
    },
    {
        id: 'high_roller',
        title: 'High Roller',
        description: 'Sent a tip of 1,000 KALE or more',
        icon: '💰',
        // Logic handled in record action check usually, or we track max tip
        condition: () => false // Handled manually for single-event checks
    },
    {
        id: 'on_fire',
        title: 'On Fire',
        description: '20 tips in a row!',
        icon: '🔥',
        condition: (s) => s.currentStreak >= 20
    },
    {
        id: 'hater',
        title: 'Hater',
        description: 'Skipped 20 songs in a row. Ruthless.',
        icon: '🙅',
        condition: (s) => s.currentStreak <= -20
    },
    {
        id: 'diamond_hands',
        title: 'Diamond Hands',
        description: 'Sent over 100,000 KALE total',
        icon: '💎',
        condition: (s) => s.totalKaleSent >= 100000
    },
    {
        id: 'taste_maker',
        title: 'Taste Maker',
        description: 'Played 500 songs',
        icon: '🎧',
        condition: (s) => s.songsPlayed >= 500
    }
];

export function loadStats(): GameStats {
    if (typeof localStorage === 'undefined') return { ...INITIAL_STATS };
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return { ...INITIAL_STATS };
        return { ...INITIAL_STATS, ...JSON.parse(stored) };
    } catch (e) {
        console.error('Failed to load stats', e);
        return { ...INITIAL_STATS };
    }
}

export function saveStats(stats: GameStats) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
        console.error('Failed to save stats', e);
    }
}

export function recordInteraction(
    songId: string,
    action: 'kale' | 'fail',
    amount: number = 0
): { stats: GameStats, newAchievements: Achievement[] } {
    const stats = loadStats();

    // Update basic counters
    stats.songsPlayed++;
    if (action === 'kale') {
        stats.totalTips++;
        stats.totalKaleSent += amount;

        // Streak logic
        if (stats.currentStreak >= 0) {
            stats.currentStreak++;
        } else {
            stats.currentStreak = 1;
        }
        stats.maxKaleStreak = Math.max(stats.maxKaleStreak, stats.currentStreak);
    } else {
        stats.totalSkips++;

        // Streak logic
        if (stats.currentStreak <= 0) {
            stats.currentStreak--;
        } else {
            stats.currentStreak = -1;
        }
        stats.maxFailStreak = Math.max(stats.maxFailStreak, Math.abs(stats.currentStreak));
    }

    // Record history
    stats.history[songId] = {
        songId,
        action,
        amount,
        timestamp: Date.now()
    };

    // Check Achievements
    const newAchievements: Achievement[] = [];

    // Check standard conditions
    ACHIEVEMENTS.forEach(ach => {
        if (!stats.unlockedAchievements.includes(ach.id)) {
            if (ach.condition(stats)) {
                stats.unlockedAchievements.push(ach.id);
                newAchievements.push(ach);
            }
        }
    });

    // Check special event-based achievements
    if (action === 'kale' && amount >= 1000 && !stats.unlockedAchievements.includes('high_roller')) {
        stats.unlockedAchievements.push('high_roller');
        const ach = ACHIEVEMENTS.find(a => a.id === 'high_roller');
        if (ach) newAchievements.push(ach);
    }

    saveStats(stats);
    return { stats, newAchievements };
}

export function getAchievement(id: string): Achievement | undefined {
    return ACHIEVEMENTS.find(a => a.id === id);
}
