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
