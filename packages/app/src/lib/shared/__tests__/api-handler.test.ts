import { describe, it, expect, vi, beforeEach } from "vitest";

// 用真实的 Headers 来模拟 NextResponse，保持与 api-response.test.ts 一致的风格
const mockJson = vi.fn();
vi.mock("next/server", () => ({
  NextResponse: {
    json: (...args: unknown[]) => {
      const [body, init] = args as [
        unknown,
        { status?: number; headers?: Record<string, string> }?,
      ];
      const headers = new Map<string, string>();
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers)) {
          headers.set(k, v);
        }
      }
      const res = {
        body,
        status: init?.status ?? 200,
        headers: {
          set: (k: string, v: string) => headers.set(k, v),
          get: (k: string) => headers.get(k),
          _map: headers,
        },
      };
      mockJson(res);
      return res;
    },
  },
}));

import { withApiHandler } from "../api-handler";
import { NextResponse } from "next/server";

describe("api-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes request and context to handler", async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiHandler(handler);
    const req = new Request("https://example.com/api/test");
    const ctx = { params: { id: "1" } };

    await wrapped(req, ctx);

    expect(handler).toHaveBeenCalledWith(req, ctx);
  });

  it("injects x-trace-id header on success", async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiHandler(handler);
    const req = new Request("https://example.com/api/test");

    const res = await wrapped(req);

    expect(res.headers.get("x-trace-id")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("preserves original response body and status", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(NextResponse.json({ data: "hello" }, { status: 201 }));
    const wrapped = withApiHandler(handler);
    const req = new Request("https://example.com/api/test");

    const res = (await wrapped(req)) as unknown as {
      body: { data: string };
      status: number;
    };

    expect(res.body).toEqual({ data: "hello" });
    expect(res.status).toBe(201);
  });

  it("catches unhandled errors and returns 500", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const wrapped = withApiHandler(handler);
    const req = new Request("https://example.com/api/test");

    const res = (await wrapped(req)) as unknown as {
      body: { error: string; traceId: string };
      status: number;
      headers: { get: (k: string) => string | undefined };
    };

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal_error");
    expect(res.body.traceId).toMatch(/^[0-9a-f]{8}$/);
    expect(res.headers.get("x-trace-id")).toBe(res.body.traceId);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`[${res.body.traceId}] Unhandled error:`),
      expect.any(Error)
    );
    consoleError.mockRestore();
  });

  it("catches non-Error throws and returns 500", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn().mockRejectedValue("string error");
    const wrapped = withApiHandler(handler);
    const req = new Request("https://example.com/api/test");

    const res = (await wrapped(req)) as unknown as {
      body: { error: string; traceId: string };
      status: number;
    };

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal_error");
    consoleError.mockRestore();
  });

  it("returns 500 for edge-incompatible db errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi
      .fn()
      .mockRejectedValue(new Error("Code generation from strings disallowed for this context"));
    const wrapped = withApiHandler(handler);
    const req = new Request("https://example.com/api/test");

    const res = (await wrapped(req)) as unknown as {
      body: { error: string; traceId: string };
      status: number;
      headers: { get: (k: string) => string | undefined };
    };

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal_error");
    expect(res.body.traceId).toMatch(/^[0-9a-f]{8}$/);
    expect(res.headers.get("x-trace-id")).toBe(res.body.traceId);
    consoleError.mockRestore();
  });

  it("accepts options without affecting behavior", async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiHandler(handler, {
      auth: "public",
      rateLimit: { max: 100, window: "1m" },
    });
    const req = new Request("https://example.com/api/test");

    const res = await wrapped(req);

    expect(res.headers.get("x-trace-id")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("works without context parameter", async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiHandler(handler);
    const req = new Request("https://example.com/api/test");

    await wrapped(req);

    expect(handler).toHaveBeenCalledWith(req, undefined);
  });
});
