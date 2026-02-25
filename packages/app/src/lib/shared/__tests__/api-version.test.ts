import { describe, it, expect } from "vitest";
import {
  API_VERSIONS,
  DEFAULT_API_VERSION,
  API_VERSION_HEADER,
  getApiVersion,
  isValidApiVersion,
} from "../api-version";
import type { ApiVersion } from "../api-version";

function fakeReq(headerValue: string | null) {
  return {
    headers: {
      get(name: string) {
        return name === API_VERSION_HEADER ? headerValue : null;
      },
    },
  };
}

describe("api-version", () => {
  describe("constants", () => {
    it("API_VERSIONS contains v1", () => {
      expect(API_VERSIONS).toContain("v1");
    });

    it("DEFAULT_API_VERSION is v1", () => {
      expect(DEFAULT_API_VERSION).toBe("v1");
    });

    it("API_VERSION_HEADER is x-api-version", () => {
      expect(API_VERSION_HEADER).toBe("x-api-version");
    });
  });

  describe("getApiVersion", () => {
    it("returns v1 when header is v1", () => {
      const version = getApiVersion(fakeReq("v1"));
      expect(version).toBe("v1");
    });

    it("returns default version when header is missing", () => {
      const version = getApiVersion(fakeReq(null));
      expect(version).toBe(DEFAULT_API_VERSION);
    });

    it("returns default version when header is invalid", () => {
      const version = getApiVersion(fakeReq("v99"));
      expect(version).toBe(DEFAULT_API_VERSION);
    });

    it("returns default version when header is empty string", () => {
      const version = getApiVersion(fakeReq(""));
      expect(version).toBe(DEFAULT_API_VERSION);
    });
  });

  describe("isValidApiVersion", () => {
    it("returns true for v1", () => {
      expect(isValidApiVersion("v1")).toBe(true);
    });

    it("returns false for unknown version", () => {
      expect(isValidApiVersion("v2")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidApiVersion("")).toBe(false);
    });
  });
});
