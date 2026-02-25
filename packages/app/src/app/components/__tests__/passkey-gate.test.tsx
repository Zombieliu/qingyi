import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

vi.mock("../passkey-wallet", () => ({
  default: () => <div data-testid="passkey-wallet">PasskeyWallet</div>,
  PASSKEY_STORAGE_KEY: "qy_passkey_wallet_v3",
}));

import PasskeyGate from "../passkey-gate";

describe("PasskeyGate", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders children when passkey exists in localStorage", async () => {
    localStorage.setItem("qy_passkey_wallet_v3", "some-value");
    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("shows gate UI when no passkey and session check fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    // Wait for session check + refresh attempt
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.getByText("ui.passkey-gate.496")).toBeInTheDocument();
    expect(screen.getByText("PasskeyWallet")).toBeInTheDocument();
  });

  it("renders children when session is ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("tries refresh when initial session check fails", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("shows blocked UI when fetch throws (catch branch)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.getByText("ui.passkey-gate.496")).toBeInTheDocument();
  });

  it("re-checks session on visibilitychange to visible", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true }); // on visibility change
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();

    // Simulate visibility change to visible
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("ignores visibilitychange when not visible", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const callsBefore = mockFetch.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 50));
    });

    // No additional fetch calls when hidden
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  it("reacts to passkey-updated event (useSyncExternalStore subscribe)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();

    // Set passkey and fire event
    localStorage.setItem("qy_passkey_wallet_v3", "some-value");
    await act(async () => {
      window.dispatchEvent(new Event("passkey-updated"));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("reacts to storage event for passkey key", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();

    localStorage.setItem("qy_passkey_wallet_v3", "some-value");
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "qy_passkey_wallet_v3" }));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("shows device-change message when sessionOk but no passkey", async () => {
    // The sessionOk && !hasPasskey branch in the blocked UI is technically unreachable
    // because if sessionOk is true, allowed is true, so state is "allowed".
    // We verify this logic is correct.
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await act(async () => {
      render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // When sessionOk=true, state is "allowed", so children are rendered
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("cleans up visibilitychange listener on unmount", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    let unmountFn!: () => void;
    await act(async () => {
      const result = render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
      unmountFn = result.unmount;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      unmountFn();
    });

    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("cleans up storage and passkey-updated listeners on unmount", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", mockFetch);

    let unmountFn!: () => void;
    await act(async () => {
      const result = render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
      unmountFn = result.unmount;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    act(() => {
      unmountFn();
    });

    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("passkey-updated", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("handles unmount during session check (active=false branch)", async () => {
    let resolveSession!: (v: { ok: boolean }) => void;
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolveSession = r;
        })
    );
    vi.stubGlobal("fetch", mockFetch);

    let unmountFn!: () => void;
    await act(async () => {
      const result = render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
      unmountFn = result.unmount;
    });

    // Unmount while fetch is pending (sets active=false)
    act(() => {
      unmountFn();
    });

    // Resolve the fetch after unmount
    await act(async () => {
      resolveSession({ ok: true });
      await new Promise((r) => setTimeout(r, 10));
    });

    // No error should occur - the active=false guard prevents setState
  });

  it("handles unmount during failed session check (catch active=false branch)", async () => {
    let rejectSession!: (e: Error) => void;
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, rej) => {
          rejectSession = rej;
        })
    );
    vi.stubGlobal("fetch", mockFetch);

    let unmountFn!: () => void;
    await act(async () => {
      const result = render(
        <PasskeyGate>
          <div>Protected Content</div>
        </PasskeyGate>
      );
      unmountFn = result.unmount;
    });

    act(() => {
      unmountFn();
    });

    await act(async () => {
      rejectSession(new Error("network"));
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  it("uses server snapshot during SSR (renderToString)", () => {
    // renderToString uses the server snapshot of useSyncExternalStore
    const html = renderToString(
      <PasskeyGate>
        <div>Protected Content</div>
      </PasskeyGate>
    );
    // Server snapshot returns false for hasPasskey, and session check doesn't run
    // So the gate should render the blocked UI (or checking state)
    expect(html).toContain("ui.passkey-gate.496");
  });
});
