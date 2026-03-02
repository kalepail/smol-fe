export type IdentityKeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export type DhKeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBuf(str: string): ArrayBuffer {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function shortKey(publicKey: string) {
  return publicKey.length > 10
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : publicKey;
}

export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  return pair as IdentityKeyPair;
}

export async function generateDhKeyPair(): Promise<DhKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  return pair as DhKeyPair;
}

async function exportJwk(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return btoa(JSON.stringify(jwk));
}

async function importJwk(
  data: string,
  algorithm: EcKeyImportParams,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const jwk = JSON.parse(atob(data));
  return crypto.subtle.importKey("jwk", jwk, algorithm, true, usages);
}

export async function exportIdentityKeys(keys: IdentityKeyPair) {
  return {
    publicJwk: await exportJwk(keys.publicKey),
    privateJwk: await exportJwk(keys.privateKey),
  };
}

export async function importIdentityKeys(data: {
  publicJwk: string;
  privateJwk: string;
}): Promise<IdentityKeyPair> {
  const algorithm: EcKeyImportParams = { name: "ECDSA", namedCurve: "P-256" };
  const publicKey = await importJwk(data.publicJwk, algorithm, ["verify"]);
  const privateKey = await importJwk(data.privateJwk, algorithm, ["sign"]);
  return { publicKey, privateKey };
}

export async function exportDhKeys(keys: DhKeyPair) {
  return {
    publicJwk: await exportJwk(keys.publicKey),
    privateJwk: await exportJwk(keys.privateKey),
  };
}

export async function importDhKeys(data: {
  publicJwk: string;
  privateJwk: string;
}): Promise<DhKeyPair> {
  const algorithm: EcKeyImportParams = { name: "ECDH", namedCurve: "P-256" };
  const publicKey = await importJwk(data.publicJwk, algorithm, []);
  const privateKey = await importJwk(data.privateJwk, algorithm, ["deriveBits", "deriveKey"]);
  return { publicKey, privateKey };
}

export async function exportPublicKeyRaw(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey("raw", key);
  return bufToBase64(buf);
}

export async function importPublicKeyRaw(
  raw: string,
  algorithm: EcKeyImportParams,
  usages: KeyUsage[]
) {
  const buf = base64ToBuf(raw);
  return crypto.subtle.importKey("raw", buf, algorithm, true, usages);
}

export function encodeUtf8(input: string): Uint8Array<ArrayBuffer> {
  // TextEncoder outputs an ArrayBuffer-backed Uint8Array in browsers.
  return encoder.encode(input) as unknown as Uint8Array<ArrayBuffer>;
}

export function decodeUtf8(buf: ArrayBuffer): string {
  return decoder.decode(buf);
}
