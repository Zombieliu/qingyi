import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));

import { apiError, apiOk } from "../api-response";

describe("apiError", () => {
  it("returns 401 for unauthorized", async () => {
    const res = apiError("unauthorized");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(body.message).toBeUndefined();
  });

  it("returns 404 with message", async () => {
    const res = apiError("not_found", "Order not found");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("Order not found");
  });

  it("returns 429 for rate_limited", async () => {
    const res = apiError("rate_limited");
    expect(res.status).toBe(429);
  });

  it("returns 500 for internal_error", async () => {
    const res = apiError("internal_error", "DB timeout");
    expect(res.status).toBe(500);
  });

  it("returns 400 for invalid_input", async () => {
    const res = apiError("invalid_input");
    expect(res.status).toBe(400);
  });

  it("returns 409 for conflict", async () => {
    const res = apiError("conflict");
    expect(res.status).toBe(409);
  });
});

describe("apiOk", () => {
  it("returns 200 with data", async () => {
    const res = apiOk({ success: true, count: 42 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(42);
  });
});

describe("apiError additional codes", () => {
  it("returns 400 for invalid_address", async () => {
    const res = apiError("invalid_address");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_address");
  });

  it("returns 403 for forbidden", async () => {
    const res = apiError("forbidden");
    expect(res.status).toBe(403);
  });

  it("returns 429 for locked", async () => {
    const res = apiError("locked");
    expect(res.status).toBe(429);
  });

  it("returns 500 for persist_failed", async () => {
    const res = apiError("persist_failed");
    expect(res.status).toBe(500);
  });

  it("returns 403 for ip_forbidden", async () => {
    const res = apiError("ip_forbidden");
    expect(res.status).toBe(403);
  });

  it("returns message when provided", async () => {
    const res = apiError("forbidden", "IP blocked");
    const body = await res.json();
    expect(body.message).toBe("IP blocked");
  });

  it("omits message when not provided", async () => {
    const res = apiError("forbidden");
    const body = await res.json();
    expect(body.message).toBeUndefined();
  });

  it("falls back to 500 for unknown error code", async () => {
    // Force an unknown code to cover the || 500 fallback branch
    const res = apiError("unknown_code" as Parameters<typeof apiError>[0]);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("unknown_code");
  });
});
