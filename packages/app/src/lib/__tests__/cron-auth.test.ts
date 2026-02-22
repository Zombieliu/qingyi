import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing
vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "test-secret-123" },
}));

import { isAuthorizedCron } from "../cron-auth";

function makeRequest(opts: { headers?: Record<string, string>; url?: string }): Request {
  const url = opts.url || "https://example.com/api/cron/test";
  const headers = new Headers(opts.headers || {});
  return new Request(url, { headers });
}

describe("isAuthorizedCron", () => {
  it("allows Vercel cron header", () => {
    const req = makeRequest({ headers: { "x-vercel-cron": "1" } });
    expect(isAuthorizedCron(req)).toBe(true);
  });

  it("allows x-cron-secret header", () => {
    const req = makeRequest({ headers: { "x-cron-secret": "test-secret-123" } });
    expect(isAuthorizedCron(req)).toBe(true);
  });

  it("allows token query param", () => {
    const req = makeRequest({ url: "https://example.com/api/cron/test?token=test-secret-123" });
    expect(isAuthorizedCron(req)).toBe(true);
  });

  it("rejects wrong secret", () => {
    const req = makeRequest({ headers: { "x-cron-secret": "wrong" } });
    expect(isAuthorizedCron(req)).toBe(false);
  });

  it("rejects no auth", () => {
    const req = makeRequest({});
    expect(isAuthorizedCron(req)).toBe(false);
  });
});

describe("isAuthorizedCron (no secret)", () => {
  it("rejects in production when no secret configured", async () => {
    vi.doMock("@/lib/env", () => ({ env: { CRON_SECRET: "" } }));
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const { isAuthorizedCron: cronAuth } = await import("../cron-auth");
    const req = makeRequest({});
    // With empty secret in production, should reject
    expect(cronAuth(req)).toBe(false);
    process.env.NODE_ENV = origEnv;
    vi.doUnmock("@/lib/env");
  });
});
