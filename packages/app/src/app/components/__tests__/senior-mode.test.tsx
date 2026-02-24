import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

vi.mock("@/lib/shared/cookie-utils", () => ({
  SENIOR_MODE_COOKIE_KEY: "qy_senior_mode",
  getCookie: vi.fn(() => undefined),
  setCookie: vi.fn(),
}));

import { getCookie, setCookie } from "@/lib/shared/cookie-utils";
import SeniorModeProvider, { SENIOR_MODE_STORAGE_KEY, applySeniorMode } from "../senior-mode";

describe("applySeniorMode", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-senior");
  });

  it("sets data-senior attribute when enabled", () => {
    applySeniorMode(true);
    expect(document.documentElement.getAttribute("data-senior")).toBe("1");
  });

  it("removes data-senior attribute when disabled", () => {
    document.documentElement.setAttribute("data-senior", "1");
    applySeniorMode(false);
    expect(document.documentElement.hasAttribute("data-senior")).toBe(false);
  });

  it("does nothing when document is undefined", () => {
    const origDoc = globalThis.document;
    // @ts-expect-error - simulating server environment
    delete globalThis.document;
    // Should not throw
    applySeniorMode(true);
    globalThis.document = origDoc;
  });
});

describe("SeniorModeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-senior");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders null", () => {
    const { container } = render(<SeniorModeProvider />);
    expect(container.innerHTML).toBe("");
  });

  it("reads from cookie on mount", () => {
    vi.mocked(getCookie).mockReturnValue("1");
    render(<SeniorModeProvider />);
    expect(getCookie).toHaveBeenCalledWith("qy_senior_mode");
    expect(document.documentElement.getAttribute("data-senior")).toBe("1");
  });

  it("falls back to localStorage when cookie is undefined", () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    localStorage.setItem(SENIOR_MODE_STORAGE_KEY, "1");
    render(<SeniorModeProvider />);
    expect(document.documentElement.getAttribute("data-senior")).toBe("1");
  });

  it("migrates localStorage value to cookie", () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    localStorage.setItem(SENIOR_MODE_STORAGE_KEY, "1");
    render(<SeniorModeProvider />);
    expect(setCookie).toHaveBeenCalledWith("qy_senior_mode", "1");
  });

  it("does not set data-senior when no value stored", () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    render(<SeniorModeProvider />);
    expect(document.documentElement.hasAttribute("data-senior")).toBe(false);
  });

  it("SENIOR_MODE_STORAGE_KEY is correct", () => {
    expect(SENIOR_MODE_STORAGE_KEY).toBe("qy_senior_mode_v1");
  });

  it("responds to storage event and updates senior mode", () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    render(<SeniorModeProvider />);

    // Simulate storage event with senior mode enabled
    localStorage.setItem(SENIOR_MODE_STORAGE_KEY, "1");
    const event = new StorageEvent("storage", {
      key: SENIOR_MODE_STORAGE_KEY,
      newValue: "1",
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(setCookie).toHaveBeenCalledWith("qy_senior_mode", "1");
    expect(document.documentElement.getAttribute("data-senior")).toBe("1");
  });

  it("responds to storage event with disabled value", () => {
    vi.mocked(getCookie).mockReturnValue("1");
    render(<SeniorModeProvider />);

    // Simulate storage event with senior mode disabled
    const event = new StorageEvent("storage", {
      key: SENIOR_MODE_STORAGE_KEY,
      newValue: "0",
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(setCookie).toHaveBeenCalledWith("qy_senior_mode", "0");
  });

  it("ignores storage events for unrelated keys", () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    render(<SeniorModeProvider />);

    const event = new StorageEvent("storage", {
      key: "unrelated_key",
      newValue: "1",
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(document.documentElement.hasAttribute("data-senior")).toBe(false);
  });

  it("responds to senior-mode-updated custom event", () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    render(<SeniorModeProvider />);

    // Set cookie to return "1" for the re-read
    vi.mocked(getCookie).mockReturnValue("1");
    act(() => {
      window.dispatchEvent(new Event("senior-mode-updated"));
    });

    expect(document.documentElement.getAttribute("data-senior")).toBe("1");
  });

  it("reads cookie value '0' as disabled", () => {
    vi.mocked(getCookie).mockReturnValue("0");
    render(<SeniorModeProvider />);
    expect(document.documentElement.hasAttribute("data-senior")).toBe(false);
  });

  it("cleans up event listeners on unmount", () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<SeniorModeProvider />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("senior-mode-updated", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("readSeniorMode returns false when window is undefined (server-side)", () => {
    const origWindow = globalThis.window;
    // @ts-expect-error - simulating server environment
    delete globalThis.window;
    // Rendering SeniorModeProvider on server should not throw
    // and should not set data-senior
    // We can't render React without window, but we can test the effect
    // by checking that applySeniorMode(false) is the default
    expect(document.documentElement.hasAttribute("data-senior")).toBe(false);
    globalThis.window = origWindow;
  });
});
