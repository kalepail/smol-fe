/**
 * Persistent store for unlocked profile upgrades using Svelte 5 runes
 * 
 * Each upgrade has two states:
 * - "owned": true if purchased or granted (permanent, verified on-chain)
 * - "enabled": true if user wants to display it (toggleable)
 */

// Keys for localStorage
const STORAGE_KEY = 'smol_upgrades';
const ENABLED_KEY = 'smol_upgrades_enabled';

export interface UnlockedUpgrades {
    premiumHeader: boolean;
    goldenKale: boolean;
    showcaseReel: boolean;
    vibeMatrix: boolean;
}

export interface EnabledUpgrades {
    premiumHeader: boolean;
    goldenKale: boolean;
    showcaseReel: boolean;
    vibeMatrix: boolean;
}

const initialOwned: UnlockedUpgrades = {
    premiumHeader: false,
    goldenKale: false,
    showcaseReel: false,
    vibeMatrix: false
};

const initialEnabled: EnabledUpgrades = {
    premiumHeader: true,  // Default to enabled when unlocked
    goldenKale: true,
    showcaseReel: true,
    vibeMatrix: true
};

// Load initial state from localStorage if available
function loadOwned(): UnlockedUpgrades {
    if (typeof window === 'undefined') return initialOwned;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialOwned;
    try {
        return { ...initialOwned, ...JSON.parse(saved) };
    } catch (e) {
        return initialOwned;
    }
}

function loadEnabled(): EnabledUpgrades {
    if (typeof window === 'undefined') return initialEnabled;
    const saved = localStorage.getItem(ENABLED_KEY);
    if (!saved) return initialEnabled;
    try {
        return { ...initialEnabled, ...JSON.parse(saved) };
    } catch (e) {
        return initialEnabled;
    }
}

export const upgradesState = $state<UnlockedUpgrades>(loadOwned());
export const enabledState = $state<EnabledUpgrades>(loadEnabled());

/**
 * Persist owned state to localStorage
 */
export function saveUpgrades() {
    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(upgradesState));
    }
}

/**
 * Persist enabled state to localStorage
 */
export function saveEnabled() {
    if (typeof window !== 'undefined') {
        localStorage.setItem(ENABLED_KEY, JSON.stringify(enabledState));
    }
}

/**
 * Unlock a specific upgrade (marks as owned)
 */
export function unlockUpgrade(key: keyof UnlockedUpgrades) {
    upgradesState[key] = true;
    saveUpgrades();
}

/**
 * Toggle whether an upgrade is displayed
 */
export function toggleUpgrade(key: keyof EnabledUpgrades) {
    enabledState[key] = !enabledState[key];
    saveEnabled();
}

/**
 * Set enabled state for an upgrade
 */
export function setUpgradeEnabled(key: keyof EnabledUpgrades, enabled: boolean) {
    enabledState[key] = enabled;
    saveEnabled();
}

/**
 * Check if an upgrade is owned AND enabled
 */
export function isUpgradeActive(key: keyof UnlockedUpgrades): boolean {
    return upgradesState[key] && enabledState[key];
}

/**
 * Check if an upgrade is owned (for display in store)
 */
export function isUnlocked(key: keyof UnlockedUpgrades): boolean {
    return upgradesState[key];
}
