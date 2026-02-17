import "server-only";
import crypto from "crypto";

export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  etag?: string;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();

export function getCache<T>(key: string): CacheEntry<T> | null {
  const entry = cacheStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }
  return entry;
}

export function setCache<T>(key: string, value: T, ttlMs: number, etag?: string): CacheEntry<T> {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + Math.max(0, ttlMs),
    etag,
  };
  cacheStore.set(key, entry as CacheEntry<unknown>);
  return entry;
}

export function computeJsonEtag(value: unknown): string {
  const json = JSON.stringify(value);
  const hash = crypto.createHash("sha1").update(json).digest("hex");
  return `"${hash}"`;
}
