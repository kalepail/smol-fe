/**
 * Server-side utility for fetching user's liked tracks
 * This should only be called from Astro pages (.astro files)
 */

/**
 * Fetch liked track IDs for the authenticated user
 * @param cookieHeader - The Cookie header from Astro.request.headers
 * @param apiUrl - The API URL (from import.meta.env.PUBLIC_API_URL)
 * @returns Array of liked track IDs, or empty array if not authenticated or on error
 */
export async function fetchLikedTracksServerSide(
  cookieHeader: string | null,
  apiUrl: string
): Promise<string[]> {
  if (!cookieHeader) {
    return [];
  }

  try {
    const response = await fetch(`${apiUrl}/likes`, {
      headers: {
        Cookie: cookieHeader,
      },
    });

    if (response.ok) {
      return await response.json();
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch likes server-side:', error);
    return [];
  }
}
