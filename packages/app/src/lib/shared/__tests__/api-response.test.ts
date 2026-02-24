import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status,
      headers: init?.headers,
    }),
  },
}));

vi.mock("crypto", () => ({
  default: {
    randomBytes: () => ({
      toString: () => "abcdef0123456789",
    }),
  },
}));

import {
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiRateLimited,
  apiInternalError,
} from "../api-response";

describe("api-response", () => {
  describe("apiError", () => {
    it("returns JSON response with error and traceId", () => {
      const res = apiError("something went wrong", 500) as unknown as {
        body: { error: string; traceId: string };
        status: number;
        headers: Record<string, string>;
      };
      expect(res.body.error).toBe("something went wrong");
      expect(res.body.traceId).toBe("abcdef0123456789");
      expect(res.status).toBe(500);
      expect(res.headers["x-trace-id"]).toBe("abcdef0123456789");
    });

    it("includes code when provided", () => {
      const res = apiError("bad", 400, { code: "INVALID" }) as unknown as {
        body: { error: string; code: string };
      };
      expect(res.body.code).toBe("INVALID");
    });

    it("omits code when not provided", () => {
      const res = apiError("bad", 400) as unknown as {
        body: { error: string; code?: string };
      };
      expect(res.body.code).toBeUndefined();
    });
  });

  describe("apiBadRequest", () => {
    it("returns 400 status", () => {
      const res = apiBadRequest("invalid input") as unknown as { status: number };
      expect(res.status).toBe(400);
    });

    it("includes code when provided", () => {
      const res = apiBadRequest("bad", "VALIDATION") as unknown as {
        body: { code: string };
      };
      expect(res.body.code).toBe("VALIDATION");
    });
  });

  describe("apiUnauthorized", () => {
    it("returns 401 with default message", () => {
      const res = apiUnauthorized() as unknown as {
        status: number;
        body: { error: string };
      };
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("unauthorized");
    });

    it("accepts custom message", () => {
      const res = apiUnauthorized("token expired") as unknown as {
        body: { error: string };
      };
      expect(res.body.error).toBe("token expired");
    });
  });

  describe("apiForbidden", () => {
    it("returns 403 with default message", () => {
      const res = apiForbidden() as unknown as {
        status: number;
        body: { error: string };
      };
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
    });
  });

  describe("apiNotFound", () => {
    it("returns 404 with default message", () => {
      const res = apiNotFound() as unknown as {
        status: number;
        body: { error: string };
      };
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found");
    });
  });

  describe("apiRateLimited", () => {
    it("returns 429 with default message", () => {
      const res = apiRateLimited() as unknown as {
        status: number;
        body: { error: string };
      };
      expect(res.status).toBe(429);
      expect(res.body.error).toBe("rate_limited");
    });
  });

  describe("apiInternalError", () => {
    it("returns 500 with Error message", () => {
      const res = apiInternalError(new Error("db failed")) as unknown as {
        status: number;
        body: { error: string };
      };
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("db failed");
    });

    it("converts non-Error to string", () => {
      const res = apiInternalError("string error") as unknown as {
        body: { error: string };
      };
      expect(res.body.error).toBe("string error");
    });
  });
});
