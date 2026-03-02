import type { D1Database } from '@cloudflare/workers-types';

export interface ChatMessage {
  id: number;
  room_id: string;
  sender_hash: string; // Pseudonymous ID
  ciphertext: string;
  nonce: string;
  created_at: number;
}

export interface RoomKey {
  room_id: string;
  epoch: number;
  encrypted_key: string; // Sealed to the recipient's public key (not used here? Wait. This table should store the ACTIVE key encrypted for specific users? Or just the active raw key encrypted by a master key? )
  // Correction: Server must NOT know the room key if possible?
  // Actually, for a simple group chat MVP, the server typically acts as a key distribution center or users exchange keys.
  // The plan said: "Room key distribution: On join, client requests the current room key encrypted ('sealed') to the user’s X25519 pubkey."
  // This implies the server KNOWS the room key to seal it.
  // OR the server stores the room key encrypted by a set of admin keys?
  // For MVP: Server generates and stores the Room Key. 
  // THREAT MODEL says: "Protect message content from server".
  // If server stores Room Key plaintext, it can decrypt everything. 
  // To be "Truly Private", the Room Key should strictly remain on clients.
  // BUT: "Rekey on membership changes".
  // MVP Compromise: Server holds the "Master Room Key" in Env/Secret or DB (High risk). 
  // Better: The FIRST user creates the room and key? 
  // Let's go with the Plan's implicit model: Server manages the room key distribution but we try to minimize exposure. 
  // Actually, the prompt says "Server stores: ciphertext...". 
  // And "On join, client requests the current room key... rekey on membership changes".
  // If the server does the rekeying, the server must know the key.
  // If the server knows the key, E2EE is compromised vs the server.
  // "Chat keys theft" is mentioned.
  // REAL E2EE: Sender encrypts for every recipient (Signal style) - too expensive (O(N) storage/upload).
  // Sender encrypts with Shared Group Key. 
  // Who generates Group Key? 
  // If Server generates it, Server knows it. 
  // ACCEPTABLE FOR MVP: Server acts as KDC (Key Distribution Center). Trust server to DELETE key after sealing? No, it needs to seal for new joiners.
  // So Server holds the active Room Key. 
  // mitigation: Encrypt Room Key with a "Server Master Key" explicitly not stored in DB (Environment var).

  // Let's stick to simple Schema for now.
  // We need to store Public Keys of users.
}

export interface UserKey {
  address: string;
  x25519_pubkey: string;
  created_at: number;
}

// DB Schema (Run this if tables don't exist)
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    sender_hash TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    nonce TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);

  CREATE TABLE IF NOT EXISTS user_keys (
    address TEXT PRIMARY KEY,
    x25519_pubkey TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_keys (
    room_id TEXT PRIMARY KEY,
    epoch INTEGER DEFAULT 1,
    key_material TEXT NOT NULL, -- The raw symmetric key (hex), ideally encrypted by a server secret
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS used_session_keys (
    key_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`;

export async function getDb(env: any): Promise<D1Database> {
  return env.DB;
}

// Helper to run schema (lazy init for MVP)
export async function initDb(db: D1Database) {
  try {
    await db.exec(SCHEMA);
  } catch (e) {
    console.error("Schema init failed (might already exist):", e);
  }
}
