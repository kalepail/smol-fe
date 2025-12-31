/**
 * Gemini AI Service for Radio Tab
 * Uses Google AI Studio free tier for smart recommendations
 */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 256,
        },
      }),
    });

    if (!response.ok) {
      console.warn("[Gemini] API error:", response.status); // User warning instead of error for expected 429s
      return null;
    }

    const data: GeminiResponse = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error("[Gemini] Request failed:", e);
    return null;
  }
}

/**
 * Convert a mood/vibe description into tag suggestions
 */
export async function moodToTags(
  mood: string,
  availableTags: string[],
  apiKey: string
): Promise<string[]> {
  const prompt = `Given this music mood or vibe: "${mood}"

Available music tags: ${availableTags.slice(0, 300).join(", ")}

Task:
1. Identify the 5-8 most relevant tags from the available list.
2. Include spelling variations if available (e.g. if 'Lo-Fi' fits, check for 'lofi', 'lo fi').
3. Focus on capturing the *synonyms* and *related sub-genres* (e.g. 'Chill', 'Ambient', 'Downtempo').

Return ONLY the tag names as a comma-separated list. No other text.`;

  const result = await callGemini(prompt, apiKey);
  if (!result) return [];

  const suggested = result
    .split(",")
    .map((t) => t.trim())
    // Fuzzy match filter: check if tag exists in list (case-insensitive)
    .filter((t) => availableTags.some(avail => avail.toLowerCase() === t.toLowerCase()));

  // Return up to 8 unique tags (deduplicated by normalized name)
  const uniqueTags = new Map();
  suggested.forEach(t => {
    const match = availableTags.find(avail => avail.toLowerCase() === t.toLowerCase());
    if (match) uniqueTags.set(match, true);
  });

  return Array.from(uniqueTags.keys()).slice(0, 8);
}

/**
 * Generate a creative station name based on selected tags
 */
export async function generateStationName(
  tags: string[],
  apiKey: string
): Promise<string> {
  const prompt = `Create a short, creative radio station name (2-4 words max) based on these music genres/tags: ${tags.join(", ")}

Examples: "Midnight Chill Lounge", "Electric Dreams", "Soul Kitchen"

Return ONLY the station name, nothing else.`;

  const result = await callGemini(prompt, apiKey);
  return result?.trim().replace(/['"]/g, "") || "Your Radio Station";
}

/**
 * Generate a fun description for the generated playlist
 */
export async function generateStationDescription(
  tags: string[],
  songCount: number,
  apiKey: string
): Promise<string> {
  const prompt = `Write a single fun, short sentence (under 15 words) describing a music playlist with ${songCount} songs in these styles: ${tags.join(", ")}

Be creative and evocative. No quotes, just the sentence.`;

  const result = await callGemini(prompt, apiKey);
  return result?.trim().replace(/['"]/g, "") || "";
}
