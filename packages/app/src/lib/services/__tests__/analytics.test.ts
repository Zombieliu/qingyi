import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentAddress = vi.fn();

vi.mock("@/lib/chain/qy-chain-lite", () => ({
  getCurrentAddress: (...args: unknown[]) => mockGetCurrentAddress(...args),
}));

const mockSendBeacon = vi.fn().mockReturnValue(true);
const mockFetch = vi.fn().mockResolvedValue({});

// Setup browser globals
const localStorageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => localStorageMap.set(key, value)),
  removeItem: vi.fn((key: string) => localStorageMap.delete(key)),
  clear: vi.fn(() => localStorageMap.clear()),
};

Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: mockLocalStorage,
    location: { pathname: "/test", search: "" },
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "document", {
  value: { referrer: "" },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "navigator", {
  value: {
    sendBeacon: mockSendBeacon,
    userAgent: "test-agent",
  },
  writable: true,
  configurable: true,
});

vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal(
  "Blob",
  class MockBlob {
    constructor(
      public parts: unknown[],
      public options: unknown
    ) {}
  }
);

import { trackEvent, syncAttributionFromLocation } from "@/lib/services/analytics";

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMap.clear();
  mockGetCurrentAddress.mockReturnValue("");
  (window as unknown as Record<string, unknown>).location = { pathname: "/test", search: "" };
  (document as unknown as Record<string, unknown>).referrer = "";
});

describe("trackEvent", () => {
  it("sends event via sendBeacon", () => {
    trackEvent("page_view");

    expect(mockSendBeacon).toHaveBeenCalledWith("/api/track", expect.any(Object));
  });

  it("includes event name in payload", () => {
    trackEvent("click_button", { buttonId: "buy" });

    expect(mockSendBeacon).toHaveBeenCalled();
    const blob = mockSendBeacon.mock.calls[0][1];
    const body = JSON.parse(blob.parts[0]);
    expect(body.event).toBe("click_button");
    expect(body.meta.buttonId).toBe("buy");
  });

  it("generates and persists clientId", () => {
    trackEvent("test");

    expect(mockLocalStorage.setItem).toHaveBeenCalled();
    // Second call should reuse clientId
    const firstClientId = localStorageMap.get("qy_client_id_v1");
    expect(firstClientId).toBeTruthy();
  });

  it("generates sessionId", () => {
    trackEvent("test");

    const sessionRaw = localStorageMap.get("qy_session_id_v1");
    expect(sessionRaw).toBeTruthy();
    const session = JSON.parse(sessionRaw!);
    expect(session.id).toBeTruthy();
  });

  it("includes userAddress when available", () => {
    mockGetCurrentAddress.mockReturnValue("0xabc123");

    trackEvent("test");

    const blob = mockSendBeacon.mock.calls[0][1];
    const body = JSON.parse(blob.parts[0]);
    expect(body.userAddress).toBe("0xabc123");
  });

  it("handles getCurrentAddress throwing", () => {
    mockGetCurrentAddress.mockImplementation(() => {
      throw new Error("no wallet");
    });

    trackEvent("test");

    const blob = mockSendBeacon.mock.calls[0][1];
    const body = JSON.parse(blob.parts[0]);
    expect(body.userAddress).toBeUndefined();
  });

  it("falls back to fetch when sendBeacon is unavailable", () => {
    const origBeacon = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", { value: null, configurable: true });

    trackEvent("test");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/track",
      expect.objectContaining({ method: "POST", keepalive: true })
    );

    Object.defineProperty(navigator, "sendBeacon", { value: origBeacon, configurable: true });
  });
});

describe("syncAttributionFromLocation", () => {
  it("captures UTM params from URL", () => {
    (window as unknown as Record<string, unknown>).location = {
      pathname: "/landing",
      search: "?utm_source=google&utm_medium=cpc",
    };

    syncAttributionFromLocation();

    const attrRaw = localStorageMap.get("qy_attribution_v1");
    expect(attrRaw).toBeTruthy();
    const attr = JSON.parse(attrRaw!);
    expect(attr.utm.utm_source).toBe("google");
    expect(attr.utm.utm_medium).toBe("cpc");
  });

  it("does nothing on server side", () => {
    const origWindow = globalThis.window;
    // @ts-expect-error - simulating server environment
    delete globalThis.window;

    syncAttributionFromLocation();

    globalThis.window = origWindow;
  });
});

describe("trackEvent edge cases", () => {
  it("does nothing when window is undefined", () => {
    const origWindow = globalThis.window;
    // @ts-expect-error - simulating server environment
    delete globalThis.window;

    // Should not throw
    trackEvent("test_event");
    expect(mockSendBeacon).not.toHaveBeenCalled();

    globalThis.window = origWindow;
  });

  it("handles safeParse returning null for corrupted JSON", () => {
    // Set corrupted session data
    localStorageMap.set("qy_session_id_v1", "not-valid-json");

    // Should not throw, should create a new session
    trackEvent("test_event");
    expect(mockSendBeacon).toHaveBeenCalled();
  });

  it("reuses existing session when not expired", () => {
    const sessionData = { id: "existing-session", lastSeen: Date.now() };
    localStorageMap.set("qy_session_id_v1", JSON.stringify(sessionData));

    trackEvent("test_event");

    const blob = mockSendBeacon.mock.calls[0][1];
    const body = JSON.parse(blob.parts[0]);
    expect(body.sessionId).toBe("existing-session");
  });

  it("creates new session when existing one is expired", () => {
    const expiredSession = { id: "old-session", lastSeen: Date.now() - 31 * 60 * 1000 };
    localStorageMap.set("qy_session_id_v1", JSON.stringify(expiredSession));

    trackEvent("test_event");

    const blob = mockSendBeacon.mock.calls[0][1];
    const body = JSON.parse(blob.parts[0]);
    expect(body.sessionId).not.toBe("old-session");
  });

  it("reuses existing clientId from localStorage", () => {
    localStorageMap.set("qy_client_id_v1", "my-client-id");

    trackEvent("test_event");

    const blob = mockSendBeacon.mock.calls[0][1];
    const body = JSON.parse(blob.parts[0]);
    expect(body.clientId).toBe("my-client-id");
  });

  it("generates clientId using fallback when crypto.randomUUID unavailable", () => {
    const origCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    trackEvent("test_event");

    expect(mockSendBeacon).toHaveBeenCalled();
    const clientId = localStorageMap.get("qy_client_id_v1");
    expect(clientId).toBeTruthy();

    Object.defineProperty(globalThis, "crypto", {
      value: origCrypto,
      writable: true,
      configurable: true,
    });
  });

  it("preserves existing attribution when no UTM params", () => {
    const existingAttr = {
      utm: { utm_source: "old" },
      firstReferrer: "https://old.com",
      firstLanding: "/old",
      firstSeenAt: 1000,
    };
    localStorageMap.set("qy_attribution_v1", JSON.stringify(existingAttr));
    (window as unknown as Record<string, unknown>).location = {
      pathname: "/new",
      search: "",
    };

    trackEvent("test_event");

    const attrRaw = localStorageMap.get("qy_attribution_v1");
    const attr = JSON.parse(attrRaw!);
    // Should preserve existing attribution since no new UTM params
    expect(attr.utm.utm_source).toBe("old");
    expect(attr.firstSeenAt).toBe(1000);
  });

  it("includes referrer in payload", () => {
    (document as unknown as Record<string, unknown>).referrer = "https://google.com";

    trackEvent("test_event");

    const blob = mockSendBeacon.mock.calls[0][1];
    const body = JSON.parse(blob.parts[0]);
    expect(body.referrer).toBe("https://google.com");
  });
});
