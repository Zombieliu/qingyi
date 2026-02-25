import { describe, it, expect, vi, beforeEach } from "vitest";

const rewriteMock = vi.fn();

vi.mock("next/server", () => ({
  NextResponse: {
    rewrite: (...args: unknown[]) => rewriteMock(...args),
  },
}));

import { GET, POST, PUT, DELETE, PATCH } from "../route";

function fakeRequest(path: string, method = "GET") {
  const url = `http://localhost:3000${path}`;
  const headers = new Map<string, string>();
  headers.set("host", "localhost:3000");
  return {
    url,
    method,
    headers: {
      get: (k: string) => headers.get(k) ?? null,
      set: (k: string, v: string) => headers.set(k, v),
      has: (k: string) => headers.has(k),
      delete: (k: string) => headers.delete(k),
      forEach: (cb: (v: string, k: string) => void) => headers.forEach(cb),
      entries: () => headers.entries(),
      keys: () => headers.keys(),
      values: () => headers.values(),
      [Symbol.iterator]: () => headers.entries(),
    },
  } as unknown as import("next/server").NextRequest;
}

describe("v1 proxy route", () => {
  beforeEach(() => {
    rewriteMock.mockClear();
    rewriteMock.mockReturnValue(new Response());
  });

  it("GET rewrites /api/v1/orders to /api/orders", () => {
    GET(fakeRequest("/api/v1/orders"));
    expect(rewriteMock).toHaveBeenCalledTimes(1);
    const [url, opts] = rewriteMock.mock.calls[0];
    expect(url.pathname).toBe("/api/orders");
    expect(opts.request.headers.get("x-api-version")).toBe("v1");
  });

  it("POST rewrites /api/v1/orders to /api/orders", () => {
    POST(fakeRequest("/api/v1/orders", "POST"));
    const [url] = rewriteMock.mock.calls[0];
    expect(url.pathname).toBe("/api/orders");
  });

  it("PUT rewrites correctly", () => {
    PUT(fakeRequest("/api/v1/orders/123", "PUT"));
    const [url] = rewriteMock.mock.calls[0];
    expect(url.pathname).toBe("/api/orders/123");
  });

  it("DELETE rewrites correctly", () => {
    DELETE(fakeRequest("/api/v1/orders/123", "DELETE"));
    const [url] = rewriteMock.mock.calls[0];
    expect(url.pathname).toBe("/api/orders/123");
  });

  it("PATCH rewrites correctly", () => {
    PATCH(fakeRequest("/api/v1/orders/123", "PATCH"));
    const [url] = rewriteMock.mock.calls[0];
    expect(url.pathname).toBe("/api/orders/123");
  });

  it("preserves query string", () => {
    GET(fakeRequest("/api/v1/orders?page=2&limit=10"));
    const [url] = rewriteMock.mock.calls[0];
    expect(url.pathname).toBe("/api/orders");
    expect(url.search).toBe("?page=2&limit=10");
  });

  it("handles nested paths", () => {
    GET(fakeRequest("/api/v1/admin/chain/orders"));
    const [url] = rewriteMock.mock.calls[0];
    expect(url.pathname).toBe("/api/admin/chain/orders");
  });
});
