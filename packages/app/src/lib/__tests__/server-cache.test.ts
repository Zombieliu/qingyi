import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => null },
}));

describe("server-cache (memory fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function freshModule() {
    vi.resetModules();
    return import("../server-cache");
  }

  it("getCache returns null for missing key", async () => {
    const { getCache } = await freshModule();
    expect(getCache("nonexistent")).toBeNull();
  });

  it("setCache + getCache round trip", async () => {
    const { setCache, getCache } = await freshModule();
    setCache("round-trip", { foo: "bar" }, 60000);
    const entry = getCache<{ foo: string }>("round-trip");
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual({ foo: "bar" });
  });

  it("getCache returns null for expired entry", async () => {
    const { setCache, getCache } = await freshModule();
    setCache("expire-me", "data", 2000);
    vi.advanceTimersByTime(2001);
    expect(getCache("expire-me")).toBeNull();
  });

  it("setCache stores etag when provided", async () => {
    const { setCache, getCache } = await freshModule();
    setCache("with-etag", "data", 60000, '"abc123"');
    const entry = getCache("with-etag");
    expect(entry).not.toBeNull();
    expect(entry!.etag).toBe('"abc123"');
  });

  it("computeJsonEtag returns consistent hash for same data", async () => {
    const { computeJsonEtag } = await freshModule();
    const etag1 = computeJsonEtag({ a: 1, b: 2 });
    const etag2 = computeJsonEtag({ a: 1, b: 2 });
    expect(etag1).toBe(etag2);
    expect(etag1).toMatch(/^"[a-f0-9]+"$/);
  });

  it("computeJsonEtag returns different hash for different data", async () => {
    const { computeJsonEtag } = await freshModule();
    const etag1 = computeJsonEtag({ a: 1 });
    const etag2 = computeJsonEtag({ a: 2 });
    expect(etag1).not.toBe(etag2);
  });

  it("invalidateCacheByPrefix removes matching keys", async () => {
    const { setCache, getCache, invalidateCacheByPrefix } = await freshModule();
    setCache("orders:1", "a", 60000);
    setCache("orders:2", "b", 60000);
    setCache("users:1", "c", 60000);

    invalidateCacheByPrefix("orders:");

    expect(getCache("orders:1")).toBeNull();
    expect(getCache("orders:2")).toBeNull();
  });

  it("invalidateCacheByPrefix preserves non-matching keys", async () => {
    const { setCache, getCache, invalidateCacheByPrefix } = await freshModule();
    setCache("orders:1", "a", 60000);
    setCache("users:1", "c", 60000);

    invalidateCacheByPrefix("orders:");

    expect(getCache("users:1")).not.toBeNull();
  });

  it("getCacheAsync falls back to memory when no Redis", async () => {
    const { setCache, getCacheAsync } = await freshModule();
    setCache("async-key", "value", 60000);
    const entry = await getCacheAsync("async-key");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe("value");
  });

  it("getCacheAsync returns null for missing key without Redis", async () => {
    const { getCacheAsync } = await freshModule();
    const entry = await getCacheAsync("missing-async");
    expect(entry).toBeNull();
  });

  it("setCache with zero TTL expires immediately", async () => {
    const { setCache, getCache } = await freshModule();
    setCache("zero-ttl", "data", 0);
    // expiresAt = Date.now() + 0, and getCache checks expiresAt <= Date.now()
    // At the same tick, expiresAt === Date.now(), so it should be expired
    expect(getCache("zero-ttl")).toBeNull();
  });

  it("multiple entries with different TTLs expire independently", async () => {
    const { setCache, getCache } = await freshModule();
    setCache("short", "a", 1000);
    setCache("long", "b", 5000);

    vi.advanceTimersByTime(1001);
    expect(getCache("short")).toBeNull();
    expect(getCache("long")).not.toBeNull();

    vi.advanceTimersByTime(4000);
    expect(getCache("long")).toBeNull();
  });
});

describe("server-cache (Redis path)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("getCacheAsync reads from Redis when memory miss", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mockRedisGet = vi.fn().mockResolvedValue({
      value: "redis-data",
      expiresAt: Date.now() + 60000,
      etag: '"redis-etag"',
    });
    const mockRedisSet = vi.fn().mockResolvedValue("OK");
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({ get: mockRedisGet, set: mockRedisSet }),
      },
    }));
    const { getCacheAsync } = await import("../server-cache");
    const entry = await getCacheAsync("redis-key");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe("redis-data");
    expect(mockRedisGet).toHaveBeenCalledWith("sc:redis-key");
  });

  it("getCacheAsync returns null for expired Redis entry", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mockRedisGet = vi.fn().mockResolvedValue({
      value: "old-data",
      expiresAt: Date.now() - 1000,
    });
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({ get: mockRedisGet, set: vi.fn() }),
      },
    }));
    const { getCacheAsync } = await import("../server-cache");
    const entry = await getCacheAsync("expired-redis-key");
    expect(entry).toBeNull();
  });

  it("getCacheAsync returns null when Redis get returns null", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mockRedisGet = vi.fn().mockResolvedValue(null);
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({ get: mockRedisGet, set: vi.fn() }),
      },
    }));
    const { getCacheAsync } = await import("../server-cache");
    const entry = await getCacheAsync("missing-redis-key");
    expect(entry).toBeNull();
  });

  it("getCacheAsync returns null when Redis throws", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mockRedisGet = vi.fn().mockRejectedValue(new Error("redis down"));
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({ get: mockRedisGet, set: vi.fn() }),
      },
    }));
    const { getCacheAsync } = await import("../server-cache");
    const entry = await getCacheAsync("error-redis-key");
    expect(entry).toBeNull();
  });

  it("setCache writes through to Redis", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mockRedisSet = vi.fn().mockResolvedValue("OK");
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({ get: vi.fn(), set: mockRedisSet }),
      },
    }));
    const { setCache } = await import("../server-cache");
    setCache("write-through-key", "data", 5000);
    // Redis write is fire-and-forget, but the mock should be called
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRedisSet).toHaveBeenCalledWith(
      "sc:write-through-key",
      expect.objectContaining({ value: "data" }),
      { ex: 5 }
    );
  });

  it("setCache handles Redis write-through failure gracefully", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mockRedisSet = vi.fn().mockRejectedValue(new Error("redis write failed"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({ get: vi.fn(), set: mockRedisSet }),
      },
    }));
    const { setCache, getCache } = await import("../server-cache");
    // Should not throw even when Redis fails
    setCache("fail-write", "data", 5000);
    await vi.advanceTimersByTimeAsync(0);
    // Memory cache should still work
    const entry = getCache("fail-write");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe("data");
    expect(warnSpy).toHaveBeenCalledWith("[cache] redis write-through failed", expect.any(Error));
    warnSpy.mockRestore();
  });
});
