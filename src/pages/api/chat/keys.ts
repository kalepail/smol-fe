
import type { APIRoute } from 'astro';
import { initDb, getDb } from '../../../lib/the-vip/db';
import { getSession } from '../../../lib/the-vip/auth';

export const PUT: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const env = (locals as any).runtime?.env;
        if (!env?.DB) {
            return new Response('Server not configured (missing DB binding)', { status: 500 });
        }
        const db = await getDb(env);
        // await initDb(db); // Lazy init might be redundant if called often, but safe for MVP

        const session = await getSession(request, db);
        if (!session) {
            return new Response('Unauthorized', { status: 401 });
        }

        const body = await request.json() as { publicKey: string }; // Hex encoded X25519 key
        if (!body.publicKey) {
            return new Response('Missing publicKey', { status: 400 });
        }

        // Store user key
        await db.prepare(`
            INSERT INTO user_keys(address, x25519_pubkey, created_at)
VALUES(?, ?, ?)
            ON CONFLICT(address) DO UPDATE SET
x25519_pubkey = excluded.x25519_pubkey,
    created_at = excluded.created_at
        `).bind(session.address, body.publicKey, Date.now()).run();

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const GET: APIRoute = async (_context) => {
    // Check if we need to fetch SOMEONE else's key?
    // For MVP, maybe not needed if Server acts as KDC.
    // But good for debugging.
    return new Response('Not implemented', { status: 501 });
}
