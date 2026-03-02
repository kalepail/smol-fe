import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

// Key Storage (IndexedDB wrapper)
const DB_NAME = 'smol-chat-db';
const STORE_NAME = 'keys';

async function getDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function getLocalKeyPair(): Promise<nacl.BoxKeyPair> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get('deviceKey');

        req.onsuccess = () => {
            if (req.result) {
                // Rehydrate
                resolve(nacl.box.keyPair.fromSecretKey(req.result));
            } else {
                // Generate New
                const newKey = nacl.box.keyPair();
                store.put(newKey.secretKey, 'deviceKey');
                resolve(newKey);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

// Helper: Hex handling for server transport
export function toHex(uint8: Uint8Array): string {
    return Array.from(uint8).map(x => x.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

// Crypto Operations

/**
 * Encrypt a message with the Room Key (Symmetric)
 */
export function encryptMessage(text: string, roomKey: Uint8Array): { ciphertext: string, nonce: string } {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageUint8 = new TextEncoder().encode(text);
    const box = nacl.secretbox(messageUint8, nonce, roomKey);

    return {
        ciphertext: encodeBase64(box),
        nonce: encodeBase64(nonce)
    };
}

/**
 * Decrypt a message with the Room Key
 */
export function decryptMessage(ciphertext: string, nonce: string, roomKey: Uint8Array): string | null {
    try {
        const box = decodeBase64(ciphertext);
        const nonceUint8 = decodeBase64(nonce);
        const decrypted = nacl.secretbox.open(box, nonceUint8, roomKey);

        if (!decrypted) return null;
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Decryption error", e);
        return null;
    }
}

/**
 * Unwrap the sealed room key from the server
 */
export function unwrapRoomKey(
    sealedKeyBase64: string,
    nonceBase64: string,
    serverPubKeyBase64: string,
    userKeyPair: nacl.BoxKeyPair
): Uint8Array | null {
    try {
        const box = decodeBase64(sealedKeyBase64);
        const nonce = decodeBase64(nonceBase64);
        const serverPubKey = decodeBase64(serverPubKeyBase64);

        const key = nacl.box.open(box, nonce, serverPubKey, userKeyPair.secretKey);
        return key; // This is the 32-byte room key
    } catch (e) {
        console.error("Key unwrap failed", e);
        return null;
    }
}
