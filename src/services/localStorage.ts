/**
 * LocalStorage service for client-side data persistence
 */

const isBrowser = typeof window !== 'undefined';

/**
 * Safely get an item from localStorage
 */
export function getItem<T>(key: string): T | null {
  if (!isBrowser) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to read from localStorage: ${key}`, error);
    return null;
  }
}

/**
 * Safely set an item in localStorage
 */
export function setItem<T>(key: string, value: T): void {
  if (!isBrowser) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to write to localStorage: ${key}`, error);
  }
}

/**
 * Safely remove an item from localStorage
 */
export function removeItem(key: string): void {
  if (!isBrowser) return;

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove from localStorage: ${key}`, error);
  }
}

/**
 * Check if a key exists in localStorage
 */
export function hasItem(key: string): boolean {
  if (!isBrowser) return false;

  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/**
 * Clear all items from localStorage
 */
export function clear(): void {
  if (!isBrowser) return;

  try {
    window.localStorage.clear();
  } catch (error) {
    console.warn('Failed to clear localStorage', error);
  }
}
