import { describe, it, expect, vi, beforeEach } from "vitest";

import { readCache, writeCache } from "../../shared/client-cache";

// Mock localStorage
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(store)) delete store[key];
  }),
  get length() {
    return Object.keys(store).length;
  },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(store)) delete store[key];
  Object.defineProperty(window, "localStorage", {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
});

describe("readCache", () => {
  it("returns null when window is undefined", () => {
    const origWindow = globalThis.window;
    // @ts-expect-error - simulating server
    delete (globalThis as Record<string, unknown>).window;

    const result = readCache("key", 60_000);
    expect(result).toBeNull();

    (globalThis as Record<string, unknown>).window = origWindow;
  });

  it("returns null for missing key", () => {
    const result = readCache("nonexistent", 60_000);
    expect(result).toBeNull();
  });

  it("round trips writeCache + readCache", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    writeCache("test-key", { foo: "bar" });
    const result = readCache<{ foo: string }>("test-key", 60_000);

    expect(result).not.toBeNull();
    expect(result!.value).toEqual({ foo: "bar" });
    expect(result!.updatedAt).toBe(now);
    expect(result!.fresh).toBe(true);

    vi.restoreAllMocks();
  });

  it("returns null for expired entry when allowStale is false", () => {
    const past = Date.now() - 120_000; // 2 minutes ago
    store["expired-key"] = JSON.stringify({ value: "old", updatedAt: past });

    const result = readCache("expired-key", 60_000);
    expect(result).toBeNull();
  });

  it("returns stale entry when allowStale=true", () => {
    const past = Date.now() - 120_000;
    store["stale-key"] = JSON.stringify({ value: "stale-data", updatedAt: past });

    const result = readCache<string>("stale-key", 60_000, true);
    expect(result).not.toBeNull();
    expect(result!.value).toBe("stale-data");
    expect(result!.fresh).toBe(false);
  });

  it("marks fresh entries correctly", () => {
    const now = Date.now();
    store["fresh-key"] = JSON.stringify({ value: "fresh-data", updatedAt: now });

    const result = readCache<string>("fresh-key", 60_000);
    expect(result).not.toBeNull();
    expect(result!.fresh).toBe(true);
  });

  it("handles corrupted JSON gracefully", () => {
    store["bad-key"] = "not-valid-json{{{";

    const result = readCache("bad-key", 60_000);
    expect(result).toBeNull();
  });
});

describe("writeCache", () => {
  it("does nothing on server (window undefined)", () => {
    const origWindow = globalThis.window;
    // @ts-expect-error - simulating server
    delete (globalThis as Record<string, unknown>).window;

    writeCache("key", "value");
    // Should not throw and should not write
    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

    (globalThis as Record<string, unknown>).window = origWindow;
  });

  it("handles localStorage.setItem throwing", () => {
    mockLocalStorage.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    // Should not throw
    writeCache("quota-key", "large-value");
  });
});

describe("readCache edge cases", () => {
  it("returns null when parsed entry has no updatedAt", () => {
    store["no-updated"] = JSON.stringify({ value: "data" });
    const result = readCache("no-updated", 60_000);
    expect(result).toBeNull();
  });
});
