/**
 * Rock Band-style 5-star rating system for Smol Hero.
 *
 * Stars are awarded based on weighted accuracy (perfect > great > ok)
 * relative to total notes. Golden stars require zero misses AND
 * high perfect rate — a true "Full Combo" achievement.
 */

export interface StarRating {
    stars: number; // 0-5
    golden: boolean; // True = golden five stars (FC / perfect run)
    accuracy: number; // 0-100 percentage
    label: string; // "S" | "A" | "B" etc.
}

export interface ScoreInput {
    perfect: number;
    great: number;
    ok: number;
    miss: number;
    score: number;
    maxCombo: number;
}

/**
 * Calculate the star rating from a game's stats.
 *
 * Weighted accuracy formula:
 *   (perfect * 1.0 + great * 0.7 + ok * 0.4 + miss * 0) / totalNotes
 *
 * Star thresholds (Rock Band inspired):
 *   0 stars: < 20% weighted accuracy
 *   1 star:  20-39%
 *   2 stars: 40-59%
 *   3 stars: 60-74%
 *   4 stars: 75-89%
 *   5 stars: 90%+
 *   Golden 5: 0 misses AND weighted accuracy >= 95%
 */
export function calculateStarRating(input: ScoreInput): StarRating {
    const totalNotes = input.perfect + input.great + input.ok + input.miss;

    if (totalNotes === 0) {
        return { stars: 0, golden: false, accuracy: 0, label: "—" };
    }

    // Weighted accuracy (perfects are worth more)
    const weightedHits =
        input.perfect * 1.0 + input.great * 0.7 + input.ok * 0.4;
    const accuracy = (weightedHits / totalNotes) * 100;

    let stars: number;
    if (accuracy >= 90) stars = 5;
    else if (accuracy >= 75) stars = 4;
    else if (accuracy >= 60) stars = 3;
    else if (accuracy >= 40) stars = 2;
    else if (accuracy >= 20) stars = 1;
    else stars = 0;

    // Golden 5 stars: zero misses AND 95%+ weighted accuracy
    const golden = input.miss === 0 && accuracy >= 95 && stars === 5;

    const label = golden
        ? "S+"
        : stars === 5
          ? "S"
          : stars === 4
            ? "A"
            : stars === 3
              ? "B"
              : stars === 2
                ? "C"
                : stars === 1
                  ? "D"
                  : "F";

    return { stars, golden, accuracy: Math.round(accuracy * 10) / 10, label };
}

// ── Local Score Persistence ──────────────────────────────────────────────────

export interface LocalScore {
    trackId: string;
    trackTitle: string;
    difficulty: string;
    score: number;
    stars: number;
    golden: boolean;
    accuracy: number;
    maxCombo: number;
    perfect: number;
    great: number;
    ok: number;
    miss: number;
    timestamp: number;
}

const SCORES_KEY = "smol:hero:scores";

export function loadLocalScores(): Record<string, LocalScore> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(SCORES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/**
 * Save a score if it's a new personal best for this track+difficulty.
 * Returns true if the score was saved (new PB).
 */
export function saveLocalScore(entry: LocalScore): boolean {
    const scores = loadLocalScores();
    const key = `${entry.trackId}:${entry.difficulty}`;
    const existing = scores[key];

    if (existing && existing.score >= entry.score) {
        return false; // Not a personal best
    }

    scores[key] = entry;

    try {
        localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
    } catch {
        // Storage full or unavailable
    }
    return true;
}

export function getLocalScore(
    trackId: string,
    difficulty: string,
): LocalScore | null {
    const scores = loadLocalScores();
    return scores[`${trackId}:${difficulty}`] || null;
}

/**
 * Get all local scores sorted by score descending.
 */
export function getAllLocalScores(): LocalScore[] {
    const scores = loadLocalScores();
    return Object.values(scores).sort((a, b) => b.score - a.score);
}
