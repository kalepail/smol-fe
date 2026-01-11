
import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini
// We use the same key variable name as radio/ai.ts for consistency
const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

export const POST: APIRoute = async ({ request }) => {
    if (!apiKey) {
        console.warn("No GEMINI_API_KEY found. Returning fallback commentary.");
        return new Response(JSON.stringify({
            comment: "This setup looks solid. Waiting for the mix to drop.",
            mood: "waiting"
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const requestId = crypto.randomUUID().split('-')[0];

    // Global In-Memory Cache to prevent spamming generic prompts
    const CACHE_TTL_MS = 1000 * 60 * 30; // 30 mins
    const globalCache = (globalThis as any).__AI_DIRECTOR_CACHE__ || new Map();
    (globalThis as any).__AI_DIRECTOR_CACHE__ = globalCache;

    try {
        const body = await request.json();
        const { context, type } = body;
        // context: string (lyrics or prompt)
        // type: 'lyrics' | 'prompt' | 'status'

        const cacheKey = `dir_${type}_${context.slice(0, 50).toLowerCase().trim()}`;
        const cached = globalCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            return new Response(cached.data, {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const ai = new GoogleGenAI({ apiKey });

        const systemPrompt = `
      You are the "AI Director" of a futuristic music generation studio.
      Your persona is: Chill, observant, slightly nerdy, deeply appreciative of creativity, and supportive.
      You are in "Deep Thinking Mode" analyzing the user's creation as it generates.
      
      Task: Read the input and provide a SINGLE, short, flavorful sentence of commentary (max 15 words).
      
      Examples:
      - "Yo, that bassline description is heavy. Good choice."
      - "Reading these lyrics... getting serious synthwave vibes."
      - "Almost done cooking the beat. Hang tight."
      - "I like where you're going with this melody."
      
      INPUT CONTEXT: "${context}"
      INPUT TYPE: ${type}
      
      Output strictly valid JSON:
      {
        "comment": "string", 
        "mood": "string" // e.g., "vibing", "analyzing", "hyped"
      }
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: systemPrompt,
            config: {
                temperature: 0.8,
                maxOutputTokens: 100,
            }
        });

        let text = response.text || "";
        if (!text && typeof (response as any).text === 'function') {
            text = (response as any).text();
        }

        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // simple validation
        try {
            JSON.parse(jsonStr);
        } catch (e) {
            // fallback if JSON broken
            return new Response(JSON.stringify({
                comment: "Processing this masterpiece... sounds promising.",
                mood: "analyzing"
            }), { status: 200 });
        }

        globalCache.set(cacheKey, {
            timestamp: Date.now(),
            data: jsonStr
        });

        return new Response(jsonStr, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Gemini Director Error:', error);
        return new Response(JSON.stringify({
            comment: "System crunching... stand by.",
            mood: "error"
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
