import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetCache = vi.fn();
const mockSetCache = vi.fn();

vi.mock("@/lib/server-cache", () => ({
  getCache: (...args: unknown[]) => mockGetCache(...args),
  setCache: (...args: unknown[]) => mockSetCache(...args),
}));

import {
  isFeatureEnabled,
  isFeatureEnabledAsync,
  setFlagOverride,
  clearFlagOverride,
  getAllFlags,
  getAllFlagsAsync,
  getFlagRegistry,
} from "../feature-flags";
import type { FeatureFlag } from "../feature-flags";

// getRedisOverrides() checks `typeof window !== "undefined"` and returns {}
// on client-side. In jsdom window exists, so we must remove it for async tests.
let savedWindow: typeof globalThis.window;

function simulateServer() {
  savedWindow = globalThis.window;
  // @ts-expect-error - simulating server environment
  delete (globalThis as Record<string, unknown>).window;
}

function restoreClient() {
  (globalThis as Record<string, unknown>).window = savedWindow;
}

// The module has an in-memory cache (_overrideCache / _overrideCacheTime) with 60s TTL.
// We use a monotonically increasing offset so each test's Date.now() is always
// past the previous test's cache write, forcing a fresh Redis read.
const realDateNow = Date.now;
let timeOffset = 0;

function advanceTime() {
  timeOffset += 200_000;
  Date.now = () => realDateNow() + timeOffset;
}

function restoreTime() {
  Date.now = realDateNow;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_FF_DISPUTE_FLOW;
  delete process.env.NEXT_PUBLIC_FF_PUSH_NOTIFICATIONS;
  delete process.env.NEXT_PUBLIC_FF_CREDIT_SYSTEM;
  delete process.env.NEXT_PUBLIC_FF_ADVANCED_ANALYTICS;
});

describe("isFeatureEnabled (sync)", () => {
  it("returns default value when no env var is set", () => {
    expect(isFeatureEnabled("dispute_flow")).toBe(false);
    expect(isFeatureEnabled("credit_system")).toBe(true);
  });

  it('returns true when env var is "1"', () => {
    process.env.NEXT_PUBLIC_FF_DISPUTE_FLOW = "1";
    expect(isFeatureEnabled("dispute_flow")).toBe(true);
  });

  it('returns false when env var is "0"', () => {
    process.env.NEXT_PUBLIC_FF_CREDIT_SYSTEM = "0";
    expect(isFeatureEnabled("credit_system")).toBe(false);
  });

  it("returns false for unknown flag", () => {
    expect(isFeatureEnabled("nonexistent_flag" as FeatureFlag)).toBe(false);
  });
});

describe("getAllFlags", () => {
  it("returns all flags with defaults", () => {
    const flags = getAllFlags();
    expect(flags.length).toBeGreaterThan(0);

    const disputeFlow = flags.find((f) => f.flag === "dispute_flow");
    expect(disputeFlow).toBeDefined();
    expect(disputeFlow!.enabled).toBe(false);
    expect(disputeFlow!.description).toBe("订单争议/退款流程");

    const creditSystem = flags.find((f) => f.flag === "credit_system");
    expect(creditSystem).toBeDefined();
    expect(creditSystem!.enabled).toBe(true);
  });

  it("reflects env var overrides", () => {
    process.env.NEXT_PUBLIC_FF_DISPUTE_FLOW = "1";
    const flags = getAllFlags();
    const disputeFlow = flags.find((f) => f.flag === "dispute_flow");
    expect(disputeFlow!.enabled).toBe(true);
  });
});

describe("getFlagRegistry", () => {
  it("returns the registry with all known flags", () => {
    const registry = getFlagRegistry();
    expect(registry).toHaveProperty("dispute_flow");
    expect(registry).toHaveProperty("push_notifications");
    expect(registry).toHaveProperty("credit_system");
    expect(registry.dispute_flow.defaultValue).toBe(false);
    expect(registry.credit_system.defaultValue).toBe(true);
  });
});

describe("isFeatureEnabledAsync", () => {
  beforeEach(() => {
    simulateServer();
    advanceTime();
  });
  afterEach(() => {
    restoreTime();
    restoreClient();
  });

  it("uses Redis override when available", async () => {
    mockGetCache.mockReturnValue({
      value: JSON.stringify({ dispute_flow: true }),
    });
    const result = await isFeatureEnabledAsync("dispute_flow");
    expect(result).toBe(true);
  });

  it("falls back to env/default when no Redis override", async () => {
    mockGetCache.mockReturnValue(null);
    const result = await isFeatureEnabledAsync("dispute_flow");
    expect(result).toBe(false);
  });

  it("falls back to env var when Redis has no override for flag", async () => {
    mockGetCache.mockReturnValue({ value: JSON.stringify({}) });
    process.env.NEXT_PUBLIC_FF_DISPUTE_FLOW = "1";
    const result = await isFeatureEnabledAsync("dispute_flow");
    expect(result).toBe(true);
  });
});

describe("setFlagOverride", () => {
  beforeEach(() => simulateServer());
  afterEach(() => restoreClient());

  it("writes override to server-cache", async () => {
    mockGetCache.mockReturnValue(null);
    await setFlagOverride("dispute_flow", true);

    expect(mockSetCache).toHaveBeenCalledWith("ff:overrides", expect.any(String), 86400_000);
    const written = JSON.parse(mockSetCache.mock.calls[0][1]);
    expect(written.dispute_flow).toBe(true);
  });

  it("merges with existing overrides", async () => {
    mockGetCache.mockReturnValue({
      value: JSON.stringify({ push_notifications: true }),
    });
    await setFlagOverride("dispute_flow", false);

    const written = JSON.parse(mockSetCache.mock.calls[0][1]);
    expect(written.dispute_flow).toBe(false);
    expect(written.push_notifications).toBe(true);
  });
});

describe("clearFlagOverride", () => {
  beforeEach(() => simulateServer());
  afterEach(() => restoreClient());

  it("removes flag from overrides in server-cache", async () => {
    mockGetCache.mockReturnValue({
      value: JSON.stringify({ dispute_flow: true, push_notifications: false }),
    });
    await clearFlagOverride("dispute_flow");

    const written = JSON.parse(mockSetCache.mock.calls[0][1]);
    expect(written).not.toHaveProperty("dispute_flow");
    expect(written.push_notifications).toBe(false);
  });

  it("handles empty overrides gracefully", async () => {
    mockGetCache.mockReturnValue(null);
    await clearFlagOverride("dispute_flow");

    const written = JSON.parse(mockSetCache.mock.calls[0][1]);
    expect(written).toEqual({});
  });
});

describe("getAllFlagsAsync", () => {
  beforeEach(() => {
    simulateServer();
    advanceTime();
  });
  afterEach(() => {
    restoreTime();
    restoreClient();
  });

  it('shows source as "redis" for overrides', async () => {
    mockGetCache.mockReturnValue({
      value: JSON.stringify({ dispute_flow: true }),
    });
    const flags = await getAllFlagsAsync();
    const disputeFlow = flags.find((f) => f.flag === "dispute_flow");
    expect(disputeFlow!.source).toBe("redis");
    expect(disputeFlow!.enabled).toBe(true);
  });

  it('shows source as "env" for env var flags', async () => {
    mockGetCache.mockReturnValue(null);
    process.env.NEXT_PUBLIC_FF_ADVANCED_ANALYTICS = "1";
    const flags = await getAllFlagsAsync();
    const analytics = flags.find((f) => f.flag === "advanced_analytics");
    expect(analytics!.source).toBe("env");
    expect(analytics!.enabled).toBe(true);
  });

  it('shows source as "default" for flags with no override or env', async () => {
    mockGetCache.mockReturnValue(null);
    const flags = await getAllFlagsAsync();
    const creditSystem = flags.find((f) => f.flag === "credit_system");
    expect(creditSystem!.source).toBe("default");
    expect(creditSystem!.enabled).toBe(true);
  });
});

describe("cache TTL behavior", () => {
  beforeEach(() => {
    simulateServer();
    advanceTime();
  });
  afterEach(() => {
    restoreTime();
    restoreClient();
  });

  it("re-fetches from Redis after cache expires", async () => {
    // First call populates cache
    mockGetCache.mockReturnValue({
      value: JSON.stringify({ dispute_flow: true }),
    });
    const first = await isFeatureEnabledAsync("dispute_flow");
    expect(first).toBe(true);

    // Advance time past 60s TTL from the cache write
    timeOffset += 61_000;
    Date.now = () => realDateNow() + timeOffset;

    mockGetCache.mockReturnValue({
      value: JSON.stringify({ dispute_flow: false }),
    });
    const second = await isFeatureEnabledAsync("dispute_flow");
    expect(second).toBe(false);
  });

  it("uses in-memory cache within TTL (no Redis call)", async () => {
    // First call populates cache
    mockGetCache.mockReturnValue({
      value: JSON.stringify({ dispute_flow: true }),
    });
    await isFeatureEnabledAsync("dispute_flow");
    const callCount = mockGetCache.mock.calls.length;

    // Second call within TTL should use in-memory cache
    const second = await isFeatureEnabledAsync("dispute_flow");
    expect(second).toBe(true);
    // getCache should not be called again (cache hit)
    expect(mockGetCache.mock.calls.length).toBe(callCount);
  });
});

describe("error handling", () => {
  beforeEach(() => {
    simulateServer();
    advanceTime();
  });
  afterEach(() => {
    restoreTime();
    restoreClient();
  });

  it("falls back to env/default when server-cache throws", async () => {
    mockGetCache.mockImplementation(() => {
      throw new Error("Redis unavailable");
    });
    const result = await isFeatureEnabledAsync("credit_system");
    expect(result).toBe(true);
  });

  it("setFlagOverride throws and logs when server-cache throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetCache.mockImplementation(() => {
      throw new Error("Redis unavailable");
    });
    await expect(setFlagOverride("dispute_flow", true)).rejects.toThrow("Redis unavailable");
    expect(errorSpy).toHaveBeenCalledWith(
      "[FeatureFlags] Failed to set override:",
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("clearFlagOverride swallows error and logs when server-cache throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetCache.mockImplementation(() => {
      throw new Error("Redis unavailable");
    });
    // clearFlagOverride does NOT rethrow, it just logs
    await clearFlagOverride("dispute_flow");
    expect(errorSpy).toHaveBeenCalledWith(
      "[FeatureFlags] Failed to clear override:",
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});
