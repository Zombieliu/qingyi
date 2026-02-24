import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSignAuthIntent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    address: "0xabc",
    signature: "sig123",
    timestamp: 1700000000000,
    nonce: "nonce123",
    bodyHash: "hash123",
  })
);

vi.mock("@/lib/chain/qy-chain", () => ({
  signAuthIntent: mockSignAuthIntent,
}));

// We need to track fetch calls manually because we reset the module between tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule() {
  return import("../user-auth-client");
}

describe("ensureUserSession", () => {
  it("throws for empty address", async () => {
    const { ensureUserSession } = await loadModule();
    await expect(ensureUserSession("")).rejects.toThrow("请先登录账号");
  });

  it("tries cookie refresh first", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const { ensureUserSession } = await loadModule();
    await ensureUserSession("0xabc");
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/session?refresh=1");
    // Should not call POST since refresh succeeded
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to passkey when refresh fails", async () => {
    // refresh fails
    mockFetch.mockResolvedValueOnce({ ok: false });
    // passkey session create succeeds
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { ensureUserSession } = await loadModule();
    await ensureUserSession("0xabc");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call: refresh
    expect(mockFetch.mock.calls[0][0]).toBe("/api/auth/session?refresh=1");
    // Second call: POST with auth headers
    expect(mockFetch.mock.calls[1][0]).toBe("/api/auth/session");
    expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(mockSignAuthIntent).toHaveBeenCalledWith(
      "user:session:create",
      JSON.stringify({ address: "0xabc" })
    );
  });

  it("deduplicates concurrent calls (sessionPromise)", async () => {
    // Make refresh slow so we can test deduplication
    let resolveRefresh!: (v: { ok: boolean }) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const { ensureUserSession } = await loadModule();
    const p1 = ensureUserSession("0xabc");
    const p2 = ensureUserSession("0xabc");

    // Both should be the same promise (deduplication)
    resolveRefresh({ ok: true });
    await p1;
    await p2;

    // fetch should only be called once since the second call reuses the promise
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("clears promise after completion", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const { ensureUserSession } = await loadModule();
    await ensureUserSession("0xabc");

    // Second call should create a new request (promise was cleared)
    mockFetch.mockResolvedValueOnce({ ok: true });
    await ensureUserSession("0xabc");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws on session create failure", async () => {
    // refresh fails
    mockFetch.mockResolvedValueOnce({ ok: false });
    // session create fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "server_error" }),
    });

    const { ensureUserSession } = await loadModule();
    await expect(ensureUserSession("0xabc")).rejects.toThrow("server_error");
  });

  it("throws generic error when session create fails with unparseable body", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.reject(new Error("parse error")),
    });

    const { ensureUserSession } = await loadModule();
    await expect(ensureUserSession("0xabc")).rejects.toThrow("session_create_failed");
  });
});

describe("fetchWithUserAuth", () => {
  it("returns response directly for non-401", async () => {
    const okResponse = { status: 200, ok: true };
    mockFetch.mockResolvedValueOnce(okResponse);

    const { fetchWithUserAuth } = await loadModule();
    const result = await fetchWithUserAuth("/api/test", {}, "0xabc");
    expect(result).toBe(okResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries after 401 with auth_required error", async () => {
    // First call returns 401 with retryable error
    mockFetch.mockResolvedValueOnce({
      status: 401,
      clone: () => ({
        json: () => Promise.resolve({ error: "auth_required" }),
      }),
    });
    // ensureUserSession refresh call
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Retry call
    const retryResponse = { status: 200, ok: true };
    mockFetch.mockResolvedValueOnce(retryResponse);

    const { fetchWithUserAuth } = await loadModule();
    const result = await fetchWithUserAuth("/api/test", {}, "0xabc");
    expect(result).toBe(retryResponse);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry for non-retryable 401 errors", async () => {
    const response401 = {
      status: 401,
      clone: () => ({
        json: () => Promise.resolve({ error: "insufficient_permissions" }),
      }),
    };
    mockFetch.mockResolvedValueOnce(response401);

    const { fetchWithUserAuth } = await loadModule();
    const result = await fetchWithUserAuth("/api/test", {}, "0xabc");
    expect(result).toBe(response401);
    // Should NOT retry — only 1 fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("handles JSON parse errors on 401 response (retries by default)", async () => {
    // 401 with unparseable body — shouldRetry stays true
    mockFetch.mockResolvedValueOnce({
      status: 401,
      clone: () => ({
        json: () => Promise.reject(new Error("invalid json")),
      }),
    });
    // ensureUserSession refresh
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Retry
    const retryResponse = { status: 200, ok: true };
    mockFetch.mockResolvedValueOnce(retryResponse);

    const { fetchWithUserAuth } = await loadModule();
    const result = await fetchWithUserAuth("/api/test", {}, "0xabc");
    expect(result).toBe(retryResponse);
  });
});
