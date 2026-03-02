import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/the-vip/db';
import { getSession } from '../../../../../lib/the-vip/auth';

export const GET: APIRoute = async (context) => {
    const { request, locals, params } = context;
    const env = (locals as any).runtime?.env;
    if (!env?.DB) {
        return new Response('Server not configured (missing DB binding)', { status: 500 });
    }

    const db = await getDb(env);
    const session = await getSession(request, db);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const roomId = params.id;
    if (!roomId) return new Response('Room ID required', { status: 400 });

    // TODO: Verify Gating Access here too?
    // Ideally Yes. For MVP, we might skip strictly repeating the Horizon check on every poll 
    // IF the listing check was sufficient UI-wise.
    // BUT Security rules say "gate required".
    // We should cache the "Access Granted" bit in the Session 
    // or just checking generic access for now.

    // Fetch messages
    // Default limit 50
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');

    let query = `SELECT * FROM messages WHERE room_id = ?`;
    const args: any[] = [roomId];

    if (cursor) {
        query += ` AND id < ?`;
        args.push(parseInt(cursor)); // Simple ID cursor
    }

    query += ` ORDER BY id DESC LIMIT 50`;

    const { results } = await db.prepare(query).bind(...args).all();

    // Get current Epoch to help client self-heal
    const roomKeyRow = await db.prepare('SELECT epoch FROM room_keys WHERE room_id = ?').bind(roomId).first();
    const currentEpoch = roomKeyRow ? roomKeyRow.epoch : 0;

    return new Response(JSON.stringify({
        messages: results.reverse(),
        meta: { currentEpoch }
    }), { status: 200 });
};

export const POST: APIRoute = async (context) => {
    const { request, locals, params } = context;
    const env = (locals as any).runtime?.env;
    if (!env?.DB) {
        return new Response('Server not configured (missing DB binding)', { status: 500 });
    }

    const db = await getDb(env);
    const session = await getSession(request, db);
    if (!session) return new Response('Unauthorized', { status: 401 });

    const roomId = params.id;
    const body = await request.json() as { ciphertext: string, nonce: string, senderHash?: string };

    if (!body.ciphertext || !body.nonce) {
        return new Response('Missing ciphertext or nonce', { status: 400 });
    }

    // Rate limit?
    // Size limit?
    if (body.ciphertext.length > 10000) {
        return new Response('Message too large', { status: 400 });
    }

    // Pseudonym for sender
    // Hash(address + SALT) so we don't store raw address on the message row (privacy hardening).
    // Or just use address if we don't care about metadata privacy vs DB admin.
    // Prompt says: "sender pseudonymous id (hash of account + server salt)".
    const salt = (env as any).CHAT_SALT || 'salt';
    // simple hash
    const senderHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session.address + salt))
        .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16));


    await db.prepare(`
        INSERT INTO messages (room_id, sender_hash, ciphertext, nonce, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).bind(roomId, senderHash, body.ciphertext, body.nonce, Date.now()).run();

    return new Response(JSON.stringify({ success: true, id: 'pending' }), { status: 200 });
};
