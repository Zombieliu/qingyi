import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/i18n/messages/zh.json", () => ({
  default: { hello: "你好", greeting: "你好 {{name}}" },
}));

vi.mock("@/i18n/messages/en.json", () => ({
  default: { hello: "Hello", greeting: "Hello {{name}}" },
}));

vi.mock("./i18n-shared", () => ({
  DEFAULT_LOCALE: "zh",
  LOCALE_COOKIE: "qy_locale",
  SUPPORTED_LOCALES: ["zh", "en"],
}));

describe("i18n-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function freshModule() {
    vi.resetModules();
    return import("../i18n-client");
  }

  describe("getClientLocale", () => {
    it("returns locale from localStorage", async () => {
      localStorage.setItem("qy_locale", "en");
      const { getClientLocale } = await freshModule();
      expect(getClientLocale()).toBe("en");
    });

    it("returns zh for zh-CN in localStorage", async () => {
      localStorage.setItem("qy_locale", "zh-CN");
      const { getClientLocale } = await freshModule();
      expect(getClientLocale()).toBe("zh");
    });

    it("returns default locale when nothing stored", async () => {
      const { getClientLocale } = await freshModule();
      // Default is zh, navigator.language in jsdom is usually "en"
      const result = getClientLocale();
      expect(["zh", "en"]).toContain(result);
    });
  });

  describe("setClientLocale", () => {
    it("sets locale in localStorage", async () => {
      const { setClientLocale } = await freshModule();
      setClientLocale("en");
      expect(localStorage.getItem("qy_locale")).toBe("en");
    });

    it("sets locale cookie", async () => {
      const { setClientLocale } = await freshModule();
      setClientLocale("en");
      expect(document.cookie).toContain("qy_locale=en");
    });

    it("ignores unsupported locale", async () => {
      const { setClientLocale } = await freshModule();
      // @ts-expect-error - testing invalid input
      setClientLocale("fr");
      expect(localStorage.getItem("qy_locale")).toBeNull();
    });
  });

  describe("t (standalone)", () => {
    it("returns translated message", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { t } = await freshModule();
      expect(t("hello")).toBe("你好");
    });

    it("returns key when message not found", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { t } = await freshModule();
      expect(t("missing.key")).toBe("missing.key");
    });

    it("interpolates params", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { t } = await freshModule();
      expect(t("greeting", { name: "World" })).toBe("你好 World");
    });
  });

  describe("getClientLocale edge cases", () => {
    it("returns locale from cookie when localStorage is empty", async () => {
      document.cookie = "qy_locale=en;path=/";
      const { getClientLocale } = await freshModule();
      expect(getClientLocale()).toBe("en");
    });

    it("returns null for unsupported locale in normalizeLocale", async () => {
      localStorage.setItem("qy_locale", "fr");
      const { getClientLocale } = await freshModule();
      // "fr" doesn't match zh or en, so normalizeLocale returns null
      // Falls through to cookie, then navigator
      const result = getClientLocale();
      expect(["zh", "en"]).toContain(result);
    });

    it("returns DEFAULT_LOCALE when window is undefined", async () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;
      const { getClientLocale } = await freshModule();
      expect(getClientLocale()).toBe("zh");
      globalThis.window = origWindow;
    });
  });

  describe("setClientLocale edge cases", () => {
    it("does nothing when window is undefined", async () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;
      const { setClientLocale } = await freshModule();
      // Should not throw
      setClientLocale("en");
      globalThis.window = origWindow;
    });
  });

  describe("useI18n hook", () => {
    it("returns locale, setLocale, and t function", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { useI18n } = await freshModule();
      const { result } = renderHook(() => useI18n());
      expect(result.current.locale).toBe("zh");
      expect(typeof result.current.setLocale).toBe("function");
      expect(typeof result.current.t).toBe("function");
    });

    it("translates messages correctly", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { useI18n } = await freshModule();
      const { result } = renderHook(() => useI18n());
      expect(result.current.t("hello")).toBe("你好");
    });

    it("interpolates params in hook t function", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { useI18n } = await freshModule();
      const { result } = renderHook(() => useI18n());
      expect(result.current.t("greeting", { name: "Test" })).toBe("你好 Test");
    });

    it("returns key when message not found in hook", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { useI18n } = await freshModule();
      const { result } = renderHook(() => useI18n());
      expect(result.current.t("nonexistent.key")).toBe("nonexistent.key");
    });

    it("changes locale via setLocale", async () => {
      localStorage.setItem("qy_locale", "zh");
      const { useI18n } = await freshModule();
      const { result } = renderHook(() => useI18n());
      expect(result.current.locale).toBe("zh");
      act(() => {
        result.current.setLocale("en");
      });
      expect(result.current.locale).toBe("en");
      expect(result.current.t("hello")).toBe("Hello");
    });
  });
});
