function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const sortedKeys = Object.keys(objectValue).sort();
    const normalized: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      normalized[key] = normalizeValue(objectValue[key]);
    }

    return normalized;
  }

  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export async function sha256Hex(payload: string | Uint8Array): Promise<string> {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  const digestBytes = new Uint8Array(digest);
  return Array.from(digestBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256HexOfJson(value: unknown): Promise<string> {
  return sha256Hex(stableJson(value));
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("hex string must contain an even number of characters");
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

export function decimalToBytes32(decimalValue: string): Uint8Array {
  const value = BigInt(decimalValue);
  const out = new Uint8Array(32);
  let cursor = value;

  for (let i = 31; i >= 0; i -= 1) {
    out[i] = Number(cursor & 0xffn);
    cursor >>= 8n;
  }

  if (cursor !== 0n) {
    throw new Error("decimal value does not fit into 32 bytes");
  }

  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function ensureBytes32Hex(hex: string): string {
  const bytes = hexToBytes(hex);
  if (bytes.length !== 32) {
    throw new Error("expected 32-byte hex string");
  }
  return bytesToHex(bytes);
}
