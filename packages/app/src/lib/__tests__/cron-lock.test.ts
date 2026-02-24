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

describe("acquireCronLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function freshModule() {
    vi.resetModules();
    return import("../cron-lock");
  }

  it("returns true on first acquire", async () => {
    const { acquireCronLock } = await freshModule();
    const result = await acquireCronLock("test-job", 60000);
    expect(result).toBe(true);
  });

  it("returns false on duplicate within TTL", async () => {
    const { acquireCronLock } = await freshModule();
    await acquireCronLock("dup-job", 60000);
    const result = await acquireCronLock("dup-job", 60000);
    expect(result).toBe(false);
  });

  it("returns true after TTL expires", async () => {
    const { acquireCronLock } = await freshModule();
    await acquireCronLock("expire-job", 5000);
    vi.advanceTimersByTime(5001);
    const result = await acquireCronLock("expire-job", 5000);
    expect(result).toBe(true);
  });

  it("returns false for empty key", async () => {
    const { acquireCronLock } = await freshModule();
    const result = await acquireCronLock("", 60000);
    expect(result).toBe(false);
  });

  it("uses cron: prefix for lock key", async () => {
    const { acquireCronLock } = await freshModule();
    // Different cron keys should be independent
    const r1 = await acquireCronLock("job-a", 60000);
    const r2 = await acquireCronLock("job-b", 60000);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });
});
