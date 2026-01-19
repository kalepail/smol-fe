/**
 * API URL helper with fallback for Cloudflare deployment
 * This ensures the API URL is never undefined, even if environment variables
 * aren't properly set during build or runtime.
 */
export const API_URL = import.meta.env.PUBLIC_API_URL || 'https://api.smol.xyz';

/**
 * Get the image URL for a smol
 */
export function getImageUrl(id: string, scale?: number): string {
    const baseUrl = `${API_URL}/image/${id}.png`;
    return scale ? `${baseUrl}?scale=${scale}` : baseUrl;
}

/**
 * Get the song URL for a smol
 */
export function getSongUrl(songId: string): string {
    const proxyUrl = import.meta.env.PUBLIC_AUDIO_PROXY_URL;
    if (proxyUrl) {
        return `${proxyUrl}/audio/${songId}`;
    }
    return `${API_URL}/song/${songId}.mp3`;
}
