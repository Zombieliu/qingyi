import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookies = vi.hoisted(() => ({
  get: vi.fn(),
}));

const mockHeaders = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/i18n/messages/zh.json", () => ({
  default: {
    hello: "你好",
    greeting: "你好 {{name}}",
    count: "共 {{count}} 个",
  },
}));

vi.mock("@/i18n/messages/en.json", () => ({
  default: {
    hello: "Hello",
    greeting: "Hello {{name}}",
    count: "Total {{count}}",
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookies)),
  headers: vi.fn(() => Promise.resolve(mockHeaders)),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── i18n-shared ───

describe("i18n-shared", () => {
  it("DEFAULT_LOCALE is zh", async () => {
    const { DEFAULT_LOCALE } = await import("../i18n-shared");
    expect(DEFAULT_LOCALE).toBe("zh");
  });

  it("SUPPORTED_LOCALES contains zh and en", async () => {
    const { SUPPORTED_LOCALES } = await import("../i18n-shared");
    expect(SUPPORTED_LOCALES).toContain("zh");
    expect(SUPPORTED_LOCALES).toContain("en");
  });
});

// ─── t() ───

describe("t()", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns message for key (server-side, default locale zh)", async () => {
    // On server (window undefined), detectLocale returns DEFAULT_LOCALE = "zh"
    const originalWindow = globalThis.window;
    // @ts-expect-error - simulating server environment
    delete globalThis.window;

    const { t } = await import("../t");
    expect(t("hello")).toBe("你好");

    globalThis.window = originalWindow;
  });

  it("returns key when message not found", async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - simulating server environment
    delete globalThis.window;

    const { t } = await import("../t");
    expect(t("nonexistent_key")).toBe("nonexistent_key");

    globalThis.window = originalWindow;
  });

  it("interpolates params", async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - simulating server environment
    delete globalThis.window;

    const { t } = await import("../t");
    expect(t("greeting", { name: "世界" })).toBe("你好 世界");
    expect(t("count", { count: 5 })).toBe("共 5 个");

    globalThis.window = originalWindow;
  });

  it("uses default locale on server (window undefined)", async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - simulating server environment
    delete globalThis.window;

    const { t } = await import("../t");
    // Default locale is zh, so should return Chinese
    expect(t("hello")).toBe("你好");

    globalThis.window = originalWindow;
  });

  it("reads locale from localStorage on client", async () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue("en"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    vi.stubGlobal("localStorage", mockLocalStorage);

    const { t } = await import("../t");
    expect(t("hello")).toBe("Hello");

    vi.unstubAllGlobals();
  });

  it("reads zh locale from localStorage on client", async () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue("zh-CN"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    vi.stubGlobal("localStorage", mockLocalStorage);

    const { t } = await import("../t");
    expect(t("hello")).toBe("你好");

    vi.unstubAllGlobals();
  });

  it("reads locale from cookie on client when localStorage empty", async () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    vi.stubGlobal("localStorage", mockLocalStorage);

    // Set document.cookie
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "qy_locale=en; other=val",
    });

    const { t } = await import("../t");
    expect(t("hello")).toBe("Hello");

    vi.unstubAllGlobals();
  });

  it("reads zh locale from cookie on client when localStorage empty", async () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    vi.stubGlobal("localStorage", mockLocalStorage);

    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "qy_locale=zh-TW; other=val",
    });

    const { t } = await import("../t");
    expect(t("hello")).toBe("你好");

    vi.unstubAllGlobals();
  });

  it("falls back to navigator.language when localStorage and cookie are empty", async () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    vi.stubGlobal("localStorage", mockLocalStorage);

    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "",
    });

    // navigator.language starts with "en" → should return "en"
    const origNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "en-US" },
      writable: true,
      configurable: true,
    });

    const { t } = await import("../t");
    expect(t("hello")).toBe("Hello");

    Object.defineProperty(globalThis, "navigator", {
      value: origNavigator,
      writable: true,
      configurable: true,
    });
    vi.unstubAllGlobals();
  });

  it("returns DEFAULT_LOCALE when navigator.language is zh", async () => {
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    vi.stubGlobal("localStorage", mockLocalStorage);

    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "",
    });

    const origNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "zh-CN" },
      writable: true,
      configurable: true,
    });

    const { t } = await import("../t");
    // zh-CN doesn't start with "en", so falls through to DEFAULT_LOCALE = "zh"
    expect(t("hello")).toBe("你好");

    Object.defineProperty(globalThis, "navigator", {
      value: origNavigator,
      writable: true,
      configurable: true,
    });
    vi.unstubAllGlobals();
  });
});

// ─── i18n.ts (server-side) ───

describe("getMessages", () => {
  it("returns correct locale messages for zh", async () => {
    const { getMessages } = await import("../i18n");
    const messages = getMessages("zh");
    expect(messages.hello).toBe("你好");
  });

  it("returns correct locale messages for en", async () => {
    const { getMessages } = await import("../i18n");
    const messages = getMessages("en");
    expect(messages.hello).toBe("Hello");
  });

  it("falls back to default locale for unknown locale", async () => {
    const { getMessages } = await import("../i18n");
    // @ts-expect-error - testing invalid locale
    const messages = getMessages("fr");
    expect(messages.hello).toBe("你好");
  });
});

describe("createTranslator", () => {
  it("returns function that looks up keys", async () => {
    const { createTranslator } = await import("../i18n");
    const t = createTranslator({ hello: "你好", bye: "再见" });
    expect(t("hello")).toBe("你好");
    expect(t("bye")).toBe("再见");
  });

  it("returns fallback when provided", async () => {
    const { createTranslator } = await import("../i18n");
    const t = createTranslator({ hello: "你好" });
    expect(t("missing", "默认值")).toBe("默认值");
  });

  it("returns key when no message and no fallback", async () => {
    const { createTranslator } = await import("../i18n");
    const t = createTranslator({});
    expect(t("some_key")).toBe("some_key");
  });
});

describe("getServerLocale", () => {
  it("reads from cookie first", async () => {
    mockCookies.get.mockReturnValue({ value: "en" });
    mockHeaders.get.mockReturnValue(null);

    const { getServerLocale } = await import("../i18n");
    const locale = await getServerLocale();
    expect(locale).toBe("en");
  });

  it("falls back to accept-language header", async () => {
    mockCookies.get.mockReturnValue(undefined);
    mockHeaders.get.mockReturnValue("en-US,en;q=0.9");

    const { getServerLocale } = await import("../i18n");
    const locale = await getServerLocale();
    expect(locale).toBe("en");
  });

  it("returns default locale when no cookie or header", async () => {
    mockCookies.get.mockReturnValue(undefined);
    mockHeaders.get.mockReturnValue(null);

    const { getServerLocale } = await import("../i18n");
    const locale = await getServerLocale();
    expect(locale).toBe("zh");
  });

  it("normalizes zh-CN to zh", async () => {
    mockCookies.get.mockReturnValue({ value: "zh-CN" });

    const { getServerLocale } = await import("../i18n");
    const locale = await getServerLocale();
    expect(locale).toBe("zh");
  });

  it("returns default locale when cookie has unsupported locale", async () => {
    mockCookies.get.mockReturnValue({ value: "fr" });
    mockHeaders.get.mockReturnValue(null);

    const { getServerLocale } = await import("../i18n");
    const locale = await getServerLocale();
    expect(locale).toBe("zh");
  });

  it("returns default locale when header has unsupported locale", async () => {
    mockCookies.get.mockReturnValue(undefined);
    mockHeaders.get.mockReturnValue("fr-FR");

    const { getServerLocale } = await import("../i18n");
    const locale = await getServerLocale();
    expect(locale).toBe("zh");
  });
});
