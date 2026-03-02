export function safeLocalStorageGet(key: string): string | null {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
        return null;
    }
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn(`[Storage] Failed to read localStorage for ${key}:`, error);
        return null;
    }
}

export function safeLocalStorageSet(key: string, value: string): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        console.warn(`[Storage] Failed to write localStorage for ${key}:`, error);
    }
}

export function safeLocalStorageRemove(key: string): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.warn(`[Storage] Failed to remove localStorage for ${key}:`, error);
    }
}
