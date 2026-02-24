import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStore, Provider } from "jotai";
import { renderHook, act } from "@testing-library/react";
import React from "react";

const mockGetCurrentAddress = vi.fn(() => "");
vi.mock("@/lib/chain/qy-chain-lite", () => ({
  getCurrentAddress: () => mockGetCurrentAddress(),
}));

const mockReadCache = vi.fn(() => null);
const mockWriteCache = vi.fn();
vi.mock("@/lib/shared/client-cache", () => ({
  readCache: (...args: unknown[]) => mockReadCache(...args),
  writeCache: (...args: unknown[]) => mockWriteCache(...args),
}));

const mockFetchWithUserAuth = vi.fn();
vi.mock("@/lib/auth/user-auth-client", () => ({
  fetchWithUserAuth: (...args: unknown[]) => mockFetchWithUserAuth(...args),
}));

// Mock React hooks for useBalance/useMantouBalance
vi.mock("jotai", async () => {
  const actual = await vi.importActual("jotai");
  return {
    ...actual,
  };
});

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
  };
});

import { balanceAtom, balanceRefreshAtom, useBalance } from "../balance-atom";
import { mantouAtom, mantouRefreshAtom, useMantouBalance } from "../mantou-atom";

describe("balanceAtom", () => {
  it("has correct initial state", () => {
    const initial = balanceAtom.init;
    expect(initial).toEqual({ balance: "0", loading: false });
  });

  it("initial balance is string '0'", () => {
    expect(balanceAtom.init.balance).toBe("0");
  });

  it("initial loading is false", () => {
    expect(balanceAtom.init.loading).toBe(false);
  });
});

describe("balanceRefreshAtom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentAddress.mockReturnValue("");
    mockReadCache.mockReturnValue(null);
  });

  it("resets balance to 0 when no address", async () => {
    mockGetCurrentAddress.mockReturnValue("");
    const store = createStore();
    await store.set(balanceRefreshAtom, false);
    const state = store.get(balanceAtom);
    expect(state.balance).toBe("0");
    expect(state.loading).toBe(false);
  });

  it("fetches balance when address exists and no cache", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ balance: "500" }),
    });
    const store = createStore();
    const result = await store.set(balanceRefreshAtom, true);
    expect(result).toBe("500");
    const state = store.get(balanceAtom);
    expect(state.balance).toBe("500");
  });

  it("uses cached value when fresh", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue({ value: "200", fresh: true });
    const store = createStore();
    const result = await store.set(balanceRefreshAtom, false);
    expect(result).toBe("200");
  });

  it("returns null when fetch response has no balance", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: "not found" }),
    });
    const store = createStore();
    const result = await store.set(balanceRefreshAtom, true);
    expect(result).toBeNull();
  });

  it("returns cached value on fetch error", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue({ value: "300", fresh: false });
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const store = createStore();
    const result = await store.set(balanceRefreshAtom, true);
    expect(result).toBe("300");
  });

  it("returns null on fetch error with no cache", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue(null);
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const store = createStore();
    const result = await store.set(balanceRefreshAtom, true);
    expect(result).toBeNull();
  });

  it("applies stale cache value to atom even when not fresh", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue({ value: "150", fresh: false });
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ balance: "200" }),
    });
    const store = createStore();
    await store.set(balanceRefreshAtom, true);
    const state = store.get(balanceAtom);
    expect(state.balance).toBe("200");
  });

  it("returns cached value when tooSoon (not forced)", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    // First call to set lastFetchAt
    mockReadCache.mockReturnValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ balance: "100" }),
    });
    const store = createStore();
    await store.set(balanceRefreshAtom, true);

    // Second call immediately - should be tooSoon
    mockReadCache.mockReturnValue({ value: "100", fresh: false });
    const result = await store.set(balanceRefreshAtom, false);
    expect(result).toBe("100");
  });

  it("handles fetch returning null frozen in balance data", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ balance: undefined }),
    });
    const store = createStore();
    const result = await store.set(balanceRefreshAtom, true);
    expect(result).toBeNull();
  });
});

describe("mantouAtom", () => {
  it("has correct initial state", () => {
    const initial = mantouAtom.init;
    expect(initial).toEqual({ balance: "0", frozen: "0", loading: false });
  });

  it("initial balance is string '0'", () => {
    expect(mantouAtom.init.balance).toBe("0");
  });

  it("initial frozen is string '0'", () => {
    expect(mantouAtom.init.frozen).toBe("0");
  });
});

describe("mantouRefreshAtom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentAddress.mockReturnValue("");
    mockReadCache.mockReturnValue(null);
  });

  it("resets mantou to 0 when no address", async () => {
    mockGetCurrentAddress.mockReturnValue("");
    const store = createStore();
    await store.set(mantouRefreshAtom, false);
    const state = store.get(mantouAtom);
    expect(state.balance).toBe("0");
    expect(state.frozen).toBe("0");
  });

  it("fetches mantou balance when address exists", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockFetchWithUserAuth.mockResolvedValue({
      json: () => Promise.resolve({ balance: "100", frozen: "20" }),
    });
    const store = createStore();
    const result = await store.set(mantouRefreshAtom, true);
    expect(result).toEqual({ balance: "100", frozen: "20" });
    const state = store.get(mantouAtom);
    expect(state.balance).toBe("100");
    expect(state.frozen).toBe("20");
  });

  it("uses cached value when fresh", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue({ value: { balance: "50", frozen: "10" }, fresh: true });
    const store = createStore();
    const result = await store.set(mantouRefreshAtom, false);
    expect(result).toEqual({ balance: "50", frozen: "10" });
  });

  it("returns null when fetch response has no balance", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockFetchWithUserAuth.mockResolvedValue({
      json: () => Promise.resolve({ error: "not found" }),
    });
    const store = createStore();
    const result = await store.set(mantouRefreshAtom, true);
    expect(result).toBeNull();
  });

  it("returns cached value on fetch error", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue({ value: { balance: "80", frozen: "5" }, fresh: false });
    mockFetchWithUserAuth.mockRejectedValue(new Error("network error"));
    const store = createStore();
    const result = await store.set(mantouRefreshAtom, true);
    expect(result).toEqual({ balance: "80", frozen: "5" });
  });

  it("returns null on fetch error with no cache", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue(null);
    mockFetchWithUserAuth.mockRejectedValue(new Error("network error"));
    const store = createStore();
    const result = await store.set(mantouRefreshAtom, true);
    expect(result).toBeNull();
  });

  it("applies stale cache value to atom even when not fresh", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockReadCache.mockReturnValue({ value: { balance: "30", frozen: "5" }, fresh: false });
    mockFetchWithUserAuth.mockResolvedValue({
      json: () => Promise.resolve({ balance: "60", frozen: "15" }),
    });
    const store = createStore();
    await store.set(mantouRefreshAtom, true);
    const state = store.get(mantouAtom);
    expect(state.balance).toBe("60");
    expect(state.frozen).toBe("15");
  });

  it("returns cached value when tooSoon (not forced)", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    // First call to set lastFetchAt
    mockReadCache.mockReturnValue(null);
    mockFetchWithUserAuth.mockResolvedValue({
      json: () => Promise.resolve({ balance: "100", frozen: "20" }),
    });
    const store = createStore();
    await store.set(mantouRefreshAtom, true);

    // Second call immediately - should be tooSoon
    mockReadCache.mockReturnValue({ value: { balance: "100", frozen: "20" }, fresh: false });
    const result = await store.set(mantouRefreshAtom, false);
    expect(result).toEqual({ balance: "100", frozen: "20" });
  });

  it("handles fetch returning null frozen in mantou data", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockFetchWithUserAuth.mockResolvedValue({
      json: () => Promise.resolve({ balance: "50", frozen: null }),
    });
    const store = createStore();
    const result = await store.set(mantouRefreshAtom, true);
    expect(result).toEqual({ balance: "50", frozen: "0" });
  });

  it("handles fetch returning undefined balance", async () => {
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockFetchWithUserAuth.mockResolvedValue({
      json: () => Promise.resolve({ error: "not found" }),
    });
    const store = createStore();
    const result = await store.set(mantouRefreshAtom, true);
    expect(result).toBeNull();
  });
});

describe("useBalance", () => {
  it("returns balance state and refresh function", () => {
    const store = createStore();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store }, children);
    const { result } = renderHook(() => useBalance(), { wrapper });
    expect(result.current.balance).toBe("0");
    expect(result.current.loading).toBe(false);
    expect(typeof result.current.refresh).toBe("function");
  });
});

describe("useMantouBalance", () => {
  it("returns mantou state and refresh function", () => {
    const store = createStore();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store }, children);
    const { result } = renderHook(() => useMantouBalance(), { wrapper });
    expect(result.current.balance).toBe("0");
    expect(result.current.frozen).toBe("0");
    expect(result.current.loading).toBe(false);
    expect(typeof result.current.refresh).toBe("function");
  });
});
