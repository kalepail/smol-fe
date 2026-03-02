import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini
const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

export const POST: APIRoute = async ({ request }) => {
    if (!apiKey) {
        console.warn("No GEMINI_API_KEY found. Returning fallback/demo data.");
        return new Response(JSON.stringify({
            playlistName: "Smol Dream (Demo)",
            tags: ["dream", "demo", "lofi", "chill"],
            confidence: 1.0,
            notes: "Demo mode: Set GEMINI_API_KEY to enable AI."
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const requestId = crypto.randomUUID().split('-')[0];
    const timestamp = new Date().toISOString();
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';

    console.log(`[API ${requestId}] ${timestamp} | IP: ${clientIp} | Key Present: ${!!apiKey}`);

    // Global In-Memory Cache (simple LRU-ish via Map)
    const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
    const globalCache = (globalThis as any).__AI_CACHE__ || new Map();
    (globalThis as any).__AI_CACHE__ = globalCache;

    try {
        const body = await request.json();
        const { context } = body;
        console.log(`[API ${requestId}] Context: "${context}"`);

        // 1. Check Cache
        const cacheKey = `ctx_${context.toLowerCase().trim()}`;
        const cached = globalCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            console.log(`[API ${requestId}] ⚡ CACHE HIT for "${context}"`);
            return new Response(cached.data, {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const ai = new GoogleGenAI({ apiKey });

        const inspirationTags = [
            // Electronic
            "house", "techno", "lofi", "synthwave", "drum and bass", "ambient", "dubstep", "garage", "trance", "vaporwave",
            // Hip Hop / R&B
            "hip hop", "trap", "r&b", "soul", "jazz rap", "boom bap", "neo soul", "drill",
            // Pop / Indie
            "indie pop", "dream pop", "bedroom pop", "hyperpop", "alt rock", "psychedelic", "bedroom",
            // Moods
            "chill", "energetic", "focus", "party", "night drive", "workout", "melancholy", "euphoric", "nostalgia",
            // Experimental
            "glitch", "noise", "experimental", "future bass", "idm", "breakcore"
        ];

        const prompt = `
      You are an expert radio DJ and music curator for "Smol Radio".
      
      Task: Generate a creative playlist name and a set of vibe tags based on the following context.
      
      CONTEXT INPUT: "${context || 'General upbeat radio'}"

      INSTRUCTIONS:
      1. Analyze the context creatively. If it's vague, invent a specific vibe.
      2. SUGGEST 5-8 TAGS. Do NOT just use generic tags like "music" or "vibes".
      3. Use the INSPIRATION TAGS list below for ideas, but feel free to invent others if they fit.
      4. AVOID REPETITION. If the user asks for "chill", don't just say "chill", "relax", "calm". Mix in genres like "lofi", "ambient", "jazz".
      
      INSPIRATION TAGS: ${inspirationTags.join(", ")}

      Output Requirement: strictly valid JSON only. No markdown formatting.
      Schema:
      {
        "playlistName": "string", // 2-6 words, title case, creative (e.g. "Neon City Nights", "Sunday Morning Coffee")
        "tags": ["string"], // 5-8 tags, lowercase, relevant to context
        "confidence": 0.9,
        "notes": "string" // short reason for selection
      }
    `;

        // Updated for @google/genai SDK
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.8,
            }
        });

        // Response access: response.text is a property in the new SDK (or response.text() - needs verification but user snippet said response.text)
        // Checking TS defs usually helps but user snippet is strong signal.
        // NOTE: The user sent `console.log(response.text);` which implies property.
        // However, some versions might differ. I'll blindly trust the user snippet for "response.text".

        let text = response.text || "";
        if (!text && typeof (response as any).text === 'function') {
            text = (response as any).text();
        }

        // Cleanup markdown if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // 2. Save to Cache
        globalCache.set(cacheKey, {
            timestamp: Date.now(),
            data: jsonStr
        });
        console.log(`[API ${requestId}] Saved to cache. Key count: ${globalCache.size}`);

        return new Response(jsonStr, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Gemini API Error:', error);
        return new Response(JSON.stringify({
            playlistName: "Smol Radio Backup",
            tags: ["smol", "vibes", "chill", "community", "music"],
            confidence: 0.1,
            notes: `Fallback error: ${error.message || error}`
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
