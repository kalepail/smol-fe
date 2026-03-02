
export async function toggleLike(smolId: string, isLiked: boolean): Promise<boolean> {
    // Call the API to toggle the like
    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
    const { useAuthentication } = await import('../hooks/useAuthentication');
    const { getAuthHeaders } = useAuthentication();

    const response = await fetch(`${API_URL}/likes/${smolId}`, {
        method: "PUT",
        headers: {
            ...getAuthHeaders(),
        },
        credentials: "include",
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to toggle like");
    }

    // Return the new liked state
    return !isLiked;
}
