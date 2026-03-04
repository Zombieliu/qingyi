import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  etag?: string;
};

// --- In-memory fallback (per-instance, used when Redis unavailable) ---
const memoryStore = new Map<string, CacheEntry<unknown>>();

// --- Redis (shared across serverless instances) ---
const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;

const CACHE_PREFIX = "sc:";

export function getCache<T>(key: string): CacheEntry<T> | null {
  // Sync path: memory only (keeps existing call sites sync)
  const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
}

/**
 * Async cache get — checks Redis first, falls back to memory.
 * Use this in hot paths where cross-instance cache hits matter.
 */
export async function getCacheAsync<T>(key: string): Promise<CacheEntry<T> | null> {
  // Try memory first (fast path)
  const mem = getCache<T>(key);
  if (mem) return mem;

  if (!redis) return null;
  try {
    const raw = await redis.get<CacheEntry<T>>(CACHE_PREFIX + key);
    if (!raw) return null;
    if (raw.expiresAt <= Date.now()) return null;
    // Populate memory for subsequent sync reads
    memoryStore.set(key, raw as CacheEntry<unknown>);
    return raw;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, value: T, ttlMs: number, etag?: string): CacheEntry<T> {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + Math.max(0, ttlMs),
    etag,
  };
  memoryStore.set(key, entry as CacheEntry<unknown>);

  // Write-through to Redis (fire-and-forget)
  if (redis) {
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    redis
      .set(CACHE_PREFIX + key, entry, { ex: ttlSeconds })
      .catch((e) => console.warn("[cache] redis write-through failed", e));
  }

  return entry;
}

export function computeJsonEtag(value: unknown): string {
  const json = JSON.stringify(value);
  // Fast non-cryptographic hash for cache validators.
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const digest = (hash >>> 0).toString(16).padStart(8, "0");
  return `"${digest}"`;
}

/**
 * Invalidate cache entries by prefix.
 * Clears matching keys from memory; Redis keys expire naturally via TTL.
 */
export function invalidateCacheByPrefix(prefix: string) {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
    }
  }
  // Redis keys have TTL and will expire; for immediate invalidation
  // we'd need to track keys, but the short TTL (5s for public orders) is sufficient.
}
