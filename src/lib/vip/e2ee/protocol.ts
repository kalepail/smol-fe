import {
  base64ToBuf,
  bufToBase64,
  type DhKeyPair,
  generateDhKeyPair,
  generateIdentityKeyPair,
  type IdentityKeyPair,
  importDhKeys,
  importIdentityKeys,
  importPublicKeyRaw,
  exportDhKeys,
  exportIdentityKeys,
  exportPublicKeyRaw,
  encodeUtf8,
  decodeUtf8,
} from "./keys";
import { persist, read } from "./storage";

export type SenderKeyState = {
  key: CryptoKey;
  version: number;
  rotatedAt: number;
  sentCount: number;
};

export type ClientKeyBundle = {
  identity: IdentityKeyPair;
  dh: DhKeyPair;
  sender: SenderKeyState;
};

const STORE_KEY = "vip-e2ee-keybundle";

async function generateSenderKey(): Promise<SenderKeyState> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  return { key, version: Date.now(), rotatedAt: Date.now(), sentCount: 0 };
}

async function exportSenderKey(key: CryptoKey) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufToBase64(raw);
}

async function importSenderKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBuf(raw),
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function loadKeys(): Promise<ClientKeyBundle> {
  const cached = await read(STORE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const identity = await importIdentityKeys(parsed.identity);
      const dh = await importDhKeys(parsed.dh);
      const senderKey = await importSenderKey(parsed.sender.raw);
      return {
        identity,
        dh,
        sender: {
          key: senderKey,
          version: parsed.sender.version,
          rotatedAt: parsed.sender.rotatedAt,
          sentCount: 0,
        },
      };
    } catch (err) {
      console.warn("[vip-e2ee] failed to load cache", err);
    }
  }

  const identity = await generateIdentityKeyPair();
  const dh = await generateDhKeyPair();
  const sender = await generateSenderKey();
  await persistKeys(identity, dh, sender);
  return { identity, dh, sender };
}

export async function persistKeys(
  identity: IdentityKeyPair,
  dh: DhKeyPair,
  sender: SenderKeyState
) {
  const payload = {
    identity: await exportIdentityKeys(identity),
    dh: await exportDhKeys(dh),
    sender: {
      raw: await exportSenderKey(sender.key),
      version: sender.version,
      rotatedAt: sender.rotatedAt,
    },
  };
  await persist(STORE_KEY, JSON.stringify(payload));
}

export async function maybeRotateSenderKey(
  bundle: ClientKeyBundle,
  opts: { maxMessages: number; maxMinutes: number }
): Promise<ClientKeyBundle> {
  const { sender } = bundle;
  const shouldRotate =
    sender.sentCount >= opts.maxMessages ||
    Date.now() - sender.rotatedAt > opts.maxMinutes * 60 * 1000;
  if (!shouldRotate) return bundle;

  const nextSender = await generateSenderKey();
  const updated: ClientKeyBundle = { ...bundle, sender: nextSender };
  await persistKeys(updated.identity, updated.dh, nextSender);
  return updated;
}

export async function deriveSharedKey(
  myDh: DhKeyPair,
  peerDhPublicRaw: string
): Promise<CryptoKey> {
  const publicKey = await importPublicKeyRaw(
    peerDhPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    []
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    myDh.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapSenderKeyForPeer(
  bundle: ClientKeyBundle,
  peerDhPublicRaw: string
) {
  const shared = await deriveSharedKey(bundle.dh, peerDhPublicRaw);
  const senderRaw = await exportSenderKey(bundle.sender.key);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    shared,
    base64ToBuf(senderRaw)
  );
  return {
    wrappedKey: bufToBase64(cipherBuf),
    nonce: bufToBase64(nonce.buffer),
    keyVersion: bundle.sender.version,
  };
}

export async function unwrapSenderKey(
  myDh: DhKeyPair,
  senderPublicDhRaw: string,
  wrapped: string,
  nonce: string
): Promise<SenderKeyState> {
  const shared = await deriveSharedKey(myDh, senderPublicDhRaw);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(nonce) },
    shared,
    base64ToBuf(wrapped)
  );
  const key = await crypto.subtle.importKey(
    "raw",
    plainBuf,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
  return {
    key,
    version: Date.now(),
    rotatedAt: Date.now(),
    sentCount: 0,
  };
}

export async function encryptWithSenderKey(
  sender: SenderKeyState,
  message: string
) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plain = encodeUtf8(message);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    sender.key,
    plain
  );
  sender.sentCount += 1;
  return {
    ciphertext: bufToBase64(cipher),
    nonce: bufToBase64(nonce.buffer),
    keyVersion: sender.version,
  };
}

export async function decryptWithSenderKey(
  sender: SenderKeyState,
  ciphertext: string,
  nonce: string
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(nonce) },
    sender.key,
    base64ToBuf(ciphertext)
  );
  return decodeUtf8(plain);
}

export async function signPayload(
  identity: IdentityKeyPair,
  fields: BufferSource
): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    identity.privateKey,
    fields
  );
  return bufToBase64(signature);
}

export async function exportPublicBundle(bundle: ClientKeyBundle) {
  return {
    identity: await exportPublicKeyRaw(bundle.identity.publicKey),
    dh: await exportPublicKeyRaw(bundle.dh.publicKey),
  };
}
