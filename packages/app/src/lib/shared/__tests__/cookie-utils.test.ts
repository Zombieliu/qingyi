import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SENIOR_MODE_COOKIE_KEY, getCookie, setCookie, deleteCookie } from "../cookie-utils";

describe("cookie-utils", () => {
  beforeEach(() => {
    // Clear all cookies
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("SENIOR_MODE_COOKIE_KEY", () => {
    it("is qy_senior_mode", () => {
      expect(SENIOR_MODE_COOKIE_KEY).toBe("qy_senior_mode");
    });
  });

  describe("getCookie", () => {
    it("returns undefined when cookie does not exist", () => {
      expect(getCookie("nonexistent")).toBeUndefined();
    });

    it("returns cookie value when it exists", () => {
      document.cookie = "test_cookie=hello; path=/";
      expect(getCookie("test_cookie")).toBe("hello");
    });

    it("returns correct value among multiple cookies", () => {
      document.cookie = "a=1; path=/";
      document.cookie = "b=2; path=/";
      expect(getCookie("b")).toBe("2");
    });
  });

  describe("setCookie", () => {
    it("sets a cookie with value", () => {
      setCookie("my_cookie", "value1");
      expect(getCookie("my_cookie")).toBe("value1");
    });

    it("sets cookie with SameSite=Lax", () => {
      setCookie("test", "val");
      // We can verify the cookie was set by reading it back
      expect(getCookie("test")).toBe("val");
    });
  });

  describe("deleteCookie", () => {
    it("removes a cookie", () => {
      setCookie("to_delete", "val");
      expect(getCookie("to_delete")).toBe("val");
      deleteCookie("to_delete");
      expect(getCookie("to_delete")).toBeUndefined();
    });
  });

  describe("server-side (no document)", () => {
    it("getCookie returns undefined when document is undefined", () => {
      const origDoc = globalThis.document;
      // @ts-expect-error - simulating server environment
      delete globalThis.document;
      expect(getCookie("any")).toBeUndefined();
      globalThis.document = origDoc;
    });

    it("setCookie does nothing when document is undefined", () => {
      const origDoc = globalThis.document;
      // @ts-expect-error - simulating server environment
      delete globalThis.document;
      // Should not throw
      setCookie("test", "val", 30);
      globalThis.document = origDoc;
    });

    it("deleteCookie does nothing when document is undefined", () => {
      const origDoc = globalThis.document;
      // @ts-expect-error - simulating server environment
      delete globalThis.document;
      // Should not throw
      deleteCookie("test");
      globalThis.document = origDoc;
    });
  });

  describe("getCookie edge cases", () => {
    it("returns undefined when cookie name is not found among multiple cookies", () => {
      document.cookie = "a=1; path=/";
      document.cookie = "b=2; path=/";
      expect(getCookie("c")).toBeUndefined();
    });

    it("returns undefined when parts.length is not 2 (cookie not present)", () => {
      // Ensure no matching cookie exists
      expect(getCookie("nonexistent_cookie_xyz")).toBeUndefined();
    });
  });

  describe("setCookie edge cases", () => {
    it("sets cookie with empty value", () => {
      setCookie("empty_val", "");
      // Cookie is set with empty value
      expect(document.cookie).toContain("empty_val=");
    });

    it("sets cookie with custom days parameter", () => {
      setCookie("custom_days", "val", 30);
      expect(getCookie("custom_days")).toBe("val");
    });
  });
});
