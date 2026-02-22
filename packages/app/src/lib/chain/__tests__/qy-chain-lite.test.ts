/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must set env before import
vi.stubEnv("NEXT_PUBLIC_CHAIN_ORDERS", "0");
vi.stubEnv("NEXT_PUBLIC_VISUAL_TEST", "0");

import {
  getCurrentAddress,
  getStoredWallet,
  isVisualTestMode,
  isChainOrdersEnabled,
  createChainOrderId,
  PASSKEY_STORAGE_KEY,
} from "../qy-chain-lite";

beforeEach(() => {
  localStorage.clear();
});

describe("getCurrentAddress", () => {
  it("returns address from localStorage", () => {
    localStorage.setItem(
      PASSKEY_STORAGE_KEY,
      JSON.stringify({ address: "0xabc123", publicKey: "pk123" })
    );
    expect(getCurrentAddress()).toBe("0xabc123");
  });

  it("returns empty string when no wallet stored", () => {
    expect(getCurrentAddress()).toBe("");
  });

  it("returns empty string for corrupted data", () => {
    localStorage.setItem(PASSKEY_STORAGE_KEY, "not-json");
    expect(getCurrentAddress()).toBe("");
  });
});

describe("getStoredWallet", () => {
  it("returns stored wallet", () => {
    const wallet = { address: "0xabc", publicKey: "pk" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));
    expect(getStoredWallet()).toEqual(wallet);
  });

  it("throws when no wallet", () => {
    expect(() => getStoredWallet()).toThrow("未找到");
  });

  it("throws for corrupted JSON", () => {
    localStorage.setItem(PASSKEY_STORAGE_KEY, "{bad");
    expect(() => getStoredWallet()).toThrow("数据损坏");
  });

  it("throws for incomplete data", () => {
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify({ address: "0x" }));
    expect(() => getStoredWallet()).toThrow("数据不完整");
  });
});

describe("isVisualTestMode", () => {
  it("returns false by default", () => {
    expect(isVisualTestMode()).toBe(false);
  });

  it("returns true when window flag is set", () => {
    (window as unknown as Record<string, boolean>).__PW_VISUAL_TEST__ = true;
    expect(isVisualTestMode()).toBe(true);
    delete (window as unknown as Record<string, boolean>).__PW_VISUAL_TEST__;
  });
});

describe("isChainOrdersEnabled", () => {
  it("returns false when env is 0", () => {
    expect(isChainOrdersEnabled()).toBe(false);
  });

  it("returns true in visual test mode", () => {
    (window as unknown as Record<string, boolean>).__VISUAL_TEST__ = true;
    expect(isChainOrdersEnabled()).toBe(true);
    delete (window as unknown as Record<string, boolean>).__VISUAL_TEST__;
  });
});

describe("createChainOrderId", () => {
  it("returns a numeric string", () => {
    const id = createChainOrderId();
    expect(id).toMatch(/^\d+$/);
  });

  it("returns unique ids", () => {
    const ids = new Set(Array.from({ length: 10 }, () => createChainOrderId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});
