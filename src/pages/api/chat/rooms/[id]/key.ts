import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/the-vip/db';
import { getSession } from '../../../../../lib/the-vip/auth';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { Keypair } from '@stellar/stellar-sdk'; // Used for server secret -> keypair logic, BUT we need Curve25519 (Box) keys.
// Stellar uses Ed25519 (Sign).
// tweetnacl uses X25519 (Box). 
// We cannot easily convert Ed25519 Secret -> X25519 Secret safely without libraries (or just using `nacl.box.keyPair.fromSecretKey` if strictly compatible).
// Actually, `nacl.sign.keyPair.fromSecretKey` is for styling.
// BETTER: Generate a dedicated X25519 Keypair for the server from a separate secret or hash of the secret.

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

    // 1. Get User's Public Key
    const userKeyRow = await db.prepare('SELECT x25519_pubkey FROM user_keys WHERE address = ?').bind(session.address).first();
    if (!userKeyRow) {
        return new Response(JSON.stringify({ error: 'User public key not found. Please PUT /keys first.' }), { status: 412 }); // Precondition Failed
    }
    const userPubKeyHex = userKeyRow.x25519_pubkey as string;

    // 2. Get or Create Room Key
    let roomKeyRow = await db.prepare('SELECT key_material, epoch FROM room_keys WHERE room_id = ?').bind(roomId).first();

    // Server Master Key for encrypting room keys at rest
    // For MVP, we store room keys as hex in DB. 
    // If we want to be fancy, we encrypt them. 
    // Let's assume `key_material` in DB is the RAW random 32-byte key (hex encoded). 
    // SECURITY WARNING: DB Admin can read chat.
    // IMPROVEMENT: Encrypt it with `CHAT_SERVER_SECRET`.

    let roomKeyHex = '';
    let epoch = 0;

    if (!roomKeyRow) {
        // Create new room key
        const newKey = nacl.randomBytes(32);
        roomKeyHex = Buffer.from(newKey).toString('hex');
        epoch = Date.now(); // Use timestamp as unique epoch ID

        await db.prepare('INSERT INTO room_keys (room_id, key_material, epoch, created_at) VALUES (?, ?, ?, ?)').bind(roomId, roomKeyHex, epoch, Date.now()).run();
    } else {
        roomKeyHex = roomKeyRow.key_material as string;
        epoch = roomKeyRow.epoch as number;
    }

    // 3. Seal the Room Key for the User
    // We need a Server X25519 Keypair to perform the sealing (Box).
    // Or we use `nacl.box.seal` (anonymous sender) if the client doesn't verify the server?
    // Use `nacl.box` (authenticated) so client knows it came from Server.
    // We need a persistent Server X25519 Key.
    // Let's generate one from the CHAT_SERVER_SECRET (hash it -> params).

    const serverSecret = (env as any).CHAT_SERVER_SECRET || process.env.CHAT_SERVER_SECRET;
    if (!serverSecret) {
        return new Response(JSON.stringify({ error: 'Missing CHAT_SERVER_SECRET' }), { status: 500 });
    }
    // Hash secret to get 32 bytes for box seed
    const serverBoxSeed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serverSecret));
    const serverBoxKeypair = nacl.box.keyPair.fromSecretKey(new Uint8Array(serverBoxSeed));

    // Decode User Pubkey (Hex -> Uint8Array)
    const userBoxPubKey = new Uint8Array(Buffer.from(userPubKeyHex, 'hex'));

    // Decode Room Key
    const roomKeyBytes = new Uint8Array(Buffer.from(roomKeyHex, 'hex'));

    // Encrypt
    const nonce = nacl.randomBytes(24);
    const box = nacl.box(
        roomKeyBytes,
        nonce,
        userBoxPubKey,
        serverBoxKeypair.secretKey
    );

    return new Response(JSON.stringify({
        roomId,
        epoch, // Return epoch so client knows what they have
        encryptedKey: encodeBase64(box), // Base64 for transport
        nonce: encodeBase64(nonce),
        serverPublicKey: encodeBase64(serverBoxKeypair.publicKey) // Send server pubkey so client can open it
    }), { status: 200 });
};
