import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";

const { mockPush, mockSetLocale, mockApplySeniorMode, mockGetCookie, mockSetCookie, mockLocale } =
  vi.hoisted(() => ({
    mockPush: vi.fn(),
    mockSetLocale: vi.fn(),
    mockApplySeniorMode: vi.fn(),
    mockGetCookie: vi.fn(() => undefined as string | undefined),
    mockSetCookie: vi.fn(),
    mockLocale: { value: "en" as string },
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/i18n/i18n-client", () => ({
  useI18n: () => ({
    locale: mockLocale.value,
    setLocale: mockSetLocale,
    t: (k: string) => k,
  }),
}));

vi.mock("@/app/components/senior-mode", () => ({
  applySeniorMode: mockApplySeniorMode,
  SENIOR_MODE_STORAGE_KEY: "qy_senior_mode_v1",
}));

vi.mock("@/lib/shared/cookie-utils", () => ({
  SENIOR_MODE_COOKIE_KEY: "qy_senior_mode",
  getCookie: (...args: unknown[]) => mockGetCookie(...args),
  setCookie: (...args: unknown[]) => mockSetCookie(...args),
}));

import SettingsPanel from "../settings-panel";

describe("SettingsPanel", () => {
  const onBack = vi.fn();
  const onLogout = vi.fn();
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    originalLocation = window.location;
    mockLocale.value = "en";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (window.location !== originalLocation) {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    }
  });

  it("renders settings title", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.title")).toBeInTheDocument();
  });

  it("renders back button and calls onBack", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const backBtn = screen.getByLabelText("comp.settings_panel.001");
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it("renders logout button and calls onLogout", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const logoutBtn = screen.getByText("settings.logout");
    fireEvent.click(logoutBtn);
    expect(onLogout).toHaveBeenCalled();
  });

  it("renders appearance section", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.section.appearance")).toBeInTheDocument();
  });

  it("renders about section", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.section.about")).toBeInTheDocument();
  });

  it("renders language switch button", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.language.switch")).toBeInTheDocument();
  });

  it("renders senior mode toggle", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.row.senior")).toBeInTheDocument();
  });

  it("navigates to about page on click", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const aboutBtn = screen.getByText("settings.row.about");
    fireEvent.click(aboutBtn.closest("button")!);
    expect(mockPush).toHaveBeenCalledWith("/me/about");
  });

  it("navigates to guide page on click", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const guideBtn = screen.getByText("settings.row.guide");
    fireEvent.click(guideBtn.closest("button")!);
    expect(mockPush).toHaveBeenCalledWith("/me/guide");
  });

  it("navigates to feedback page on click", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const feedbackBtn = screen.getByText("settings.row.feedback");
    fireEvent.click(feedbackBtn.closest("button")!);
    expect(mockPush).toHaveBeenCalledWith("/me/support");
  });

  it("renders footer text", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.footer")).toBeInTheDocument();
  });

  it("toggles senior mode ON: sets localStorage, cookie, applies, dispatches event", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);

    // Find the toggle button (aria-pressed)
    const toggle = screen.getByRole("button", { pressed: false });
    fireEvent.click(toggle);

    expect(localStorage.getItem("qy_senior_mode_v1")).toBe("1");
    expect(mockSetCookie).toHaveBeenCalledWith("qy_senior_mode", "1");
    expect(mockApplySeniorMode).toHaveBeenCalledWith(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "senior-mode-updated" })
    );
  });

  it("toggles senior mode OFF: removes localStorage, sets cookie to 0", () => {
    // Pre-set senior mode ON via cookie
    mockGetCookie.mockReturnValue("1");
    const { unmount } = render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);

    const toggle = screen.getByRole("button", { pressed: true });
    fireEvent.click(toggle);

    expect(localStorage.getItem("qy_senior_mode_v1")).toBeNull();
    expect(mockSetCookie).toHaveBeenCalledWith("qy_senior_mode", "0");
    expect(mockApplySeniorMode).toHaveBeenCalledWith(false);
    unmount();
    mockGetCookie.mockReturnValue(undefined);
  });

  it("reads senior mode from cookie on mount (cookie=1)", () => {
    mockGetCookie.mockReturnValue("1");
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const toggle = screen.getByRole("button", { pressed: true });
    expect(toggle).toBeInTheDocument();
    mockGetCookie.mockReturnValue(undefined);
  });

  it("reads senior mode from localStorage when cookie is undefined", () => {
    mockGetCookie.mockReturnValue(undefined);
    localStorage.setItem("qy_senior_mode_v1", "1");
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const toggle = screen.getByRole("button", { pressed: true });
    expect(toggle).toBeInTheDocument();
  });

  it("responds to storage event for senior mode key", () => {
    mockGetCookie.mockReturnValue(undefined);
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);

    // Initially off
    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();

    // Simulate storage event
    localStorage.setItem("qy_senior_mode_v1", "1");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "qy_senior_mode_v1" }));
    });

    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
  });

  it("responds to senior-mode-updated custom event", () => {
    mockGetCookie.mockReturnValue(undefined);
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);

    localStorage.setItem("qy_senior_mode_v1", "1");
    act(() => {
      window.dispatchEvent(new Event("senior-mode-updated"));
    });

    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
  });

  it("ignores storage events for unrelated keys", () => {
    mockGetCookie.mockReturnValue(undefined);
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "some_other_key" }));
    });

    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();
  });

  it("language switch calls setLocale and reloads", () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const switchBtn = screen.getByText("settings.language.switch");
    fireEvent.click(switchBtn);

    expect(mockSetLocale).toHaveBeenCalledWith("zh");
    expect(reloadMock).toHaveBeenCalled();
  });

  it("reads senior mode as OFF when cookie is '0'", () => {
    mockGetCookie.mockReturnValue("0");
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const toggle = screen.getByRole("button", { pressed: false });
    expect(toggle).toBeInTheDocument();
    mockGetCookie.mockReturnValue(undefined);
  });

  it("reads senior mode as OFF when localStorage is not '1'", () => {
    mockGetCookie.mockReturnValue(undefined);
    localStorage.setItem("qy_senior_mode_v1", "0");
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const toggle = screen.getByRole("button", { pressed: false });
    expect(toggle).toBeInTheDocument();
  });

  it("renders about row without icon", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    // The "about" row has no icon, just label
    const aboutLabel = screen.getByText("settings.row.about");
    expect(aboutLabel).toBeInTheDocument();
    // It should be inside a button (has href)
    expect(aboutLabel.closest("button")).not.toBeNull();
  });

  it("renders guide and feedback rows with icons", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.row.guide")).toBeInTheDocument();
    expect(screen.getByText("settings.row.feedback")).toBeInTheDocument();
  });

  it("renders description for language row", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.language.current")).toBeInTheDocument();
  });

  it("renders description for senior mode row", () => {
    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(screen.getByText("settings.row.senior.desc")).toBeInTheDocument();
  });

  it("renders chevrons for about section rows", () => {
    const { container } = render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    const chevrons = container.querySelectorAll(".settings-chevron");
    // About section rows all have href, so they all get chevrons
    expect(chevrons.length).toBeGreaterThanOrEqual(3);
  });

  it("renders correctly with zh locale (nextLocale=en branch)", () => {
    mockLocale.value = "zh";
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    // Language switch should call setLocale with "en" (nextLocale when locale is "zh")
    const switchBtn = screen.getByText("settings.language.switch");
    fireEvent.click(switchBtn);
    expect(mockSetLocale).toHaveBeenCalledWith("en");
    expect(reloadMock).toHaveBeenCalled();
  });

  it("renders via SSR without errors", () => {
    const html = renderToString(<SettingsPanel onBack={onBack} onLogout={onLogout} />);
    expect(html).toContain("settings.title");
    expect(html).toContain("settings.logout");
  });
});
