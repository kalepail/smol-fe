/**
 * LocalStorage service for client-side data persistence
 */

import { logger } from '../utils/logger.ts';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Safely get an item from localStorage
 */
export function getItem<T>(key: string): T | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn('storage', `Failed to read from localStorage: ${key}`, error);
    return null;
  }
}

/**
 * Safely set an item in localStorage
 */
export function setItem<T>(key: string, value: T): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logger.warn('storage', `Failed to write to localStorage: ${key}`, error);
  }
}

/**
 * Safely remove an item from localStorage
 */
export function removeItem(key: string): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    logger.warn('storage', `Failed to remove from localStorage: ${key}`, error);
  }
}
