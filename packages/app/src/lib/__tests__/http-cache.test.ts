import { describe, it, expect, vi, beforeEach } from "vitest";

const mockJsonFn = vi.fn();
const mockHeaders = new Map<string, string>();

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown) => {
      mockJsonFn(data);
      const headers = new Map<string, string>();
      return {
        headers: {
          set: (k: string, v: string) => headers.set(k, v),
          get: (k: string) => headers.get(k) ?? null,
        },
        json: async () => data,
        status: 200,
        _headers: headers,
      };
    },
  },
}));

// We need to re-mock NextResponse constructor for notModified
// Actually, let's use a more complete mock
vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;

    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map();
    }

    async json() {
      return JSON.parse(this.body as string);
    }

    static json(data: unknown) {
      const res = new MockNextResponse(JSON.stringify(data));
      // Store original data for json() retrieval
      res.json = async () => data;
      return res;
    }
  }

  return { NextResponse: MockNextResponse };
});

import { getIfNoneMatch, jsonWithEtag, notModified } from "../http-cache";

describe("http-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getIfNoneMatch", () => {
    it("returns header value when present", () => {
      const req = new Request("https://example.com", {
        headers: { "if-none-match": '"abc123"' },
      });
      expect(getIfNoneMatch(req)).toBe('"abc123"');
    });

    it("returns empty string when header is missing", () => {
      const req = new Request("https://example.com");
      expect(getIfNoneMatch(req)).toBe("");
    });
  });

  describe("jsonWithEtag", () => {
    it("sets ETag and Cache-Control headers", () => {
      const res = jsonWithEtag({ ok: true }, '"etag1"', "public, max-age=5");
      expect(res.headers.get("ETag")).toBe('"etag1"');
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=5");
    });

    it("returns JSON body", async () => {
      const data = { items: [1, 2, 3] };
      const res = jsonWithEtag(data, '"etag2"', "no-cache");
      const body = await res.json();
      expect(body).toEqual(data);
    });
  });

  describe("notModified", () => {
    it("returns 304 status", () => {
      const res = notModified('"etag3"', "public, max-age=5");
      expect(res.status).toBe(304);
    });

    it("sets ETag and Cache-Control headers", () => {
      const res = notModified('"etag4"', "private, no-cache");
      expect(res.headers.get("ETag")).toBe('"etag4"');
      expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    });
  });
});
