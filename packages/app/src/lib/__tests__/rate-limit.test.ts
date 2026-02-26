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

describe("rate-limit (memory fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Re-import for each test to get fresh module state
  async function freshModule() {
    vi.resetModules();
    return import("../rate-limit");
  }

  describe("rateLimit", () => {
    it("allows requests within limit", async () => {
      const { rateLimit } = await freshModule();
      const result1 = await rateLimit("test-key", 3, 60000);
      const result2 = await rateLimit("test-key", 3, 60000);
      const result3 = await rateLimit("test-key", 3, 60000);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    });

    it("blocks after limit exceeded", async () => {
      const { rateLimit } = await freshModule();
      await rateLimit("block-key", 2, 60000);
      await rateLimit("block-key", 2, 60000);
      const result = await rateLimit("block-key", 2, 60000);
      expect(result).toBe(false);
    });

    it("resets after window expires", async () => {
      const { rateLimit } = await freshModule();
      await rateLimit("expire-key", 1, 5000);
      const blocked = await rateLimit("expire-key", 1, 5000);
      expect(blocked).toBe(false);

      vi.advanceTimersByTime(5001);

      const allowed = await rateLimit("expire-key", 1, 5000);
      expect(allowed).toBe(true);
    });

    it("treats different keys independently", async () => {
      const { rateLimit } = await freshModule();
      await rateLimit("key-a", 1, 60000);
      const blockedA = await rateLimit("key-a", 1, 60000);
      expect(blockedA).toBe(false);

      const allowedB = await rateLimit("key-b", 1, 60000);
      expect(allowedB).toBe(true);
    });

    it("prunes expired buckets on access", async () => {
      const { rateLimit } = await freshModule();
      // Fill a bucket
      await rateLimit("prune-key", 1, 1000);
      // Advance past window
      vi.advanceTimersByTime(1001);
      // New request should succeed (old bucket pruned)
      const result = await rateLimit("prune-key", 1, 1000);
      expect(result).toBe(true);
    });
  });

  describe("rateLimit with Redis", () => {
    afterEach(() => {
      vi.doMock("@/lib/env", () => ({
        env: {
          UPSTASH_REDIS_REST_URL: undefined,
          UPSTASH_REDIS_REST_TOKEN: undefined,
        },
      }));
      vi.doMock("@upstash/redis", () => ({
        Redis: { fromEnv: () => null },
      }));
    });

    it("uses Redis incr and expire when Redis is available", async () => {
      vi.resetModules();
      const mockIncr = vi.fn().mockResolvedValue(1);
      const mockExpire = vi.fn().mockResolvedValue(true);
      vi.doMock("@/lib/env", () => ({
        env: {
          UPSTASH_REDIS_REST_URL: "https://redis.example.com",
          UPSTASH_REDIS_REST_TOKEN: "test-token",
        },
      }));
      vi.doMock("@upstash/redis", () => ({
        Redis: {
          fromEnv: () => ({ incr: mockIncr, expire: mockExpire }),
        },
      }));
      const { rateLimit } = await import("../rate-limit");
      const result = await rateLimit("redis-key", 5, 60000);
      expect(result).toBe(true);
      expect(mockIncr).toHaveBeenCalledWith("redis-key");
      expect(mockExpire).toHaveBeenCalledWith("redis-key", 60);
    });

    it("does not call expire when count > 1", async () => {
      vi.resetModules();
      const mockIncr = vi.fn().mockResolvedValue(2);
      const mockExpire = vi.fn();
      vi.doMock("@/lib/env", () => ({
        env: {
          UPSTASH_REDIS_REST_URL: "https://redis.example.com",
          UPSTASH_REDIS_REST_TOKEN: "test-token",
        },
      }));
      vi.doMock("@upstash/redis", () => ({
        Redis: {
          fromEnv: () => ({ incr: mockIncr, expire: mockExpire }),
        },
      }));
      const { rateLimit } = await import("../rate-limit");
      const result = await rateLimit("redis-key-2", 5, 60000);
      expect(result).toBe(true);
      expect(mockExpire).not.toHaveBeenCalled();
    });

    it("returns false when count exceeds limit", async () => {
      vi.resetModules();
      const mockIncr = vi.fn().mockResolvedValue(6);
      vi.doMock("@/lib/env", () => ({
        env: {
          UPSTASH_REDIS_REST_URL: "https://redis.example.com",
          UPSTASH_REDIS_REST_TOKEN: "test-token",
        },
      }));
      vi.doMock("@upstash/redis", () => ({
        Redis: {
          fromEnv: () => ({ incr: mockIncr, expire: vi.fn() }),
        },
      }));
      const { rateLimit } = await import("../rate-limit");
      const result = await rateLimit("redis-key-3", 5, 60000);
      expect(result).toBe(false);
    });
  });

  describe("consumeNonce with Redis", () => {
    afterEach(() => {
      vi.doMock("@/lib/env", () => ({
        env: {
          UPSTASH_REDIS_REST_URL: undefined,
          UPSTASH_REDIS_REST_TOKEN: undefined,
        },
      }));
      vi.doMock("@upstash/redis", () => ({
        Redis: { fromEnv: () => null },
      }));
    });

    it("uses Redis set with nx when Redis is available", async () => {
      vi.resetModules();
      const mockSet = vi.fn().mockResolvedValue("OK");
      vi.doMock("@/lib/env", () => ({
        env: {
          UPSTASH_REDIS_REST_URL: "https://redis.example.com",
          UPSTASH_REDIS_REST_TOKEN: "test-token",
        },
      }));
      vi.doMock("@upstash/redis", () => ({
        Redis: {
          fromEnv: () => ({ set: mockSet, incr: vi.fn(), expire: vi.fn() }),
        },
      }));
      const { consumeNonce } = await import("../rate-limit");
      const result = await consumeNonce("redis-nonce", 5000);
      expect(result).toBe(true);
      expect(mockSet).toHaveBeenCalledWith("redis-nonce", "1", { nx: true, px: 5000 });
    });

    it("returns false when Redis set returns null (duplicate)", async () => {
      vi.resetModules();
      const mockSet = vi.fn().mockResolvedValue(null);
      vi.doMock("@/lib/env", () => ({
        env: {
          UPSTASH_REDIS_REST_URL: "https://redis.example.com",
          UPSTASH_REDIS_REST_TOKEN: "test-token",
        },
      }));
      vi.doMock("@upstash/redis", () => ({
        Redis: {
          fromEnv: () => ({ set: mockSet, incr: vi.fn(), expire: vi.fn() }),
        },
      }));
      const { consumeNonce } = await import("../rate-limit");
      const result = await consumeNonce("redis-nonce-dup", 5000);
      expect(result).toBe(false);
    });
  });

  describe("consumeNonce", () => {
    it("returns true the first time", async () => {
      const { consumeNonce } = await freshModule();
      const result = await consumeNonce("nonce-1", 60000);
      expect(result).toBe(true);
    });

    it("returns false for duplicate within TTL", async () => {
      const { consumeNonce } = await freshModule();
      await consumeNonce("nonce-dup", 60000);
      const result = await consumeNonce("nonce-dup", 60000);
      expect(result).toBe(false);
    });

    it("allows reuse after TTL expires", async () => {
      const { consumeNonce } = await freshModule();
      await consumeNonce("nonce-ttl", 3000);
      vi.advanceTimersByTime(3001);
      const result = await consumeNonce("nonce-ttl", 3000);
      expect(result).toBe(true);
    });

    it("prunes expired nonces on access", async () => {
      const { consumeNonce } = await freshModule();
      await consumeNonce("nonce-prune-a", 1000);
      await consumeNonce("nonce-prune-b", 5000);
      vi.advanceTimersByTime(1001);
      // nonce-prune-a should be pruned, nonce-prune-b still active
      const resultA = await consumeNonce("nonce-prune-a", 1000);
      expect(resultA).toBe(true);
      const resultB = await consumeNonce("nonce-prune-b", 5000);
      expect(resultB).toBe(false);
    });
  });
});
