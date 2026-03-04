import "server-only";

const textEncoder = new TextEncoder();

function getRuntimeCrypto(): Crypto {
  if (!globalThis.crypto) {
    throw new Error("runtime_crypto_unavailable");
  }
  return globalThis.crypto;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function digestToBytes(digest: ArrayBuffer): Uint8Array {
  return new Uint8Array(digest);
}

export function randomHex(byteLength: number): string {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error("invalid_random_hex_length");
  }
  const bytes = new Uint8Array(byteLength);
  getRuntimeCrypto().getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function randomUuid(): string {
  const crypto = getRuntimeCrypto();
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for runtimes without randomUUID.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Mirrors Node's crypto.randomInt(min, max) with max-exclusive semantics.
 */
export function randomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error("random_int_bounds_must_be_integer");
  }
  if (max <= min) {
    throw new Error("random_int_invalid_range");
  }

  const range = max - min;
  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % range);
  const source = getRuntimeCrypto();
  const buf = new Uint32Array(1);

  while (true) {
    source.getRandomValues(buf);
    const n = buf[0];
    if (n < limit) {
      return min + (n % range);
    }
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await getRuntimeCrypto().subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToHex(digestToBytes(digest));
}

export async function sha256Base64(value: string): Promise<string> {
  const digest = await getRuntimeCrypto().subtle.digest("SHA-256", textEncoder.encode(value));
  const bytes = digestToBytes(digest);
  const chars: string[] = [];
  for (const byte of bytes) {
    chars.push(String.fromCharCode(byte));
  }
  return btoa(chars.join(""));
}

/**
 * Best-effort timing-safe compare for ASCII/UTF-8 strings.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
