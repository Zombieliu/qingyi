import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;

// P0 FIX: Warn once when falling back to in-memory rate limiting in production.
// In-memory buckets are per-process and ineffective in serverless/multi-instance deployments.
let memoryFallbackWarned = false;
function warnMemoryFallback() {
  if (!memoryFallbackWarned && process.env.NODE_ENV === "production") {
    memoryFallbackWarned = true;
    console.warn(
      "[rate-limit] Redis not configured — falling back to in-memory rate limiting. " +
        "This is ineffective in serverless/multi-instance deployments. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production."
    );
  }
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
const memoryNonces = new Map<string, number>();

function pruneMemory(now: number) {
  for (const [key, bucket] of memoryBuckets.entries()) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
  }
  for (const [key, expiresAt] of memoryNonces.entries()) {
    if (expiresAt <= now) memoryNonces.delete(key);
  }
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      await redis.expire(key, ttlSeconds);
    }
    return count <= limit;
  }

  pruneMemory(now);
  warnMemoryFallback();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

export async function consumeNonce(key: string, ttlMs: number): Promise<boolean> {
  const now = Date.now();
  if (redis) {
    const result = await redis.set(key, "1", { nx: true, px: ttlMs });
    return result === "OK";
  }

  pruneMemory(now);
  warnMemoryFallback();
  const existing = memoryNonces.get(key);
  if (existing && existing > now) return false;
  memoryNonces.set(key, now + ttlMs);
  return true;
}
