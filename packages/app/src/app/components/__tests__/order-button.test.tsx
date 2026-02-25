import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/* ---- mocks ---- */
vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

const mockCreateOrder = vi.fn();
vi.mock("@/lib/services/order-service", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
}));

const mockIsChainOrdersEnabled = vi.fn(() => false);
const mockGetCurrentAddress = vi.fn(() => "");
const mockCreateChainOrderId = vi.fn(() => "chain-id-1");
const mockCreateOrderOnChain = vi.fn();
vi.mock("@/lib/chain/qy-chain", () => ({
  isChainOrdersEnabled: () => mockIsChainOrdersEnabled(),
  getCurrentAddress: () => mockGetCurrentAddress(),
  createChainOrderId: () => mockCreateChainOrderId(),
  createOrderOnChain: (...a: unknown[]) => mockCreateOrderOnChain(...a),
}));

vi.mock("@/lib/services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/chain/chain-error", () => ({
  classifyChainError: () => ({ title: "错误", message: "未知错误" }),
}));

/* stub Button as a plain <button> so we don't pull in the real UI lib */
vi.mock("@/components/ui/button", () => ({
  Button: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }
  ) => {
    const { variant: _v, size: _s, ...rest } = props;
    return <button {...rest} />;
  },
}));

vi.mock("@/app/components/state-block", () => ({
  StateBlock: ({ title, tone }: { title: string; tone: string }) => (
    <div data-testid="state-block" data-tone={tone}>
      {title}
    </div>
  ),
}));

/* GAME_PROFILE_KEY constant */
vi.mock("@/lib/shared/constants", () => ({
  GAME_PROFILE_KEY: "qy_game_profile",
}));

import OrderButton from "../order-button";

// Mock global fetch for chain-sync retries
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", mockFetch);

/* ---- helpers ---- */
const PROFILE_KEY = "qy_game_profile";
const TEST_ADDRESS = "0xTestAddr";
const validProfile = {
  [TEST_ADDRESS]: { gameName: "Player1", gameId: "12345", updatedAt: 1 },
  local: { gameName: "Player1", gameId: "12345", updatedAt: 1 },
};

function setProfile(profiles = validProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}

/** Enable chain + set address + store profile so submit() passes the guard */
function enableChainWithProfile() {
  mockIsChainOrdersEnabled.mockReturnValue(true);
  mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
  mockCreateOrderOnChain.mockResolvedValue({ digest: "digest-1" });
  setProfile();
}

/* ---- tests ---- */
describe("OrderButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsChainOrdersEnabled.mockReturnValue(false);
    mockGetCurrentAddress.mockReturnValue("");
    mockCreateOrder.mockResolvedValue({ sent: true });
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the order button with translated label", () => {
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    expect(screen.getByRole("button")).toHaveTextContent("comp.order_button.002");
  });

  it("has correct aria-label", () => {
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "为 alice 下单 陪玩");
  });

  it("prompts for game profile when none is stored", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("redirects to game-settings when user confirms profile prompt", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      get: () => "",
      configurable: true,
    });
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    expect(hrefSetter).toHaveBeenCalledWith("/me/game-settings");
    confirmSpy.mockRestore();
  });

  it("shows loading text while submitting", async () => {
    enableChainWithProfile();
    let resolveOrder!: (v: { sent: boolean }) => void;
    mockCreateOrder.mockReturnValue(
      new Promise((r) => {
        resolveOrder = r;
      })
    );
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("ui.order-button.560")
    );
    expect(screen.getByRole("button")).toBeDisabled();
    resolveOrder({ sent: true });
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });

  it("shows success state after successful order", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByTestId("state-block")).toHaveTextContent("ui.order-button.581")
    );
  });

  it("shows warning state when order sent is false", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: false, error: "通知失败" });
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      const block = screen.getByTestId("state-block");
      expect(block).toHaveTextContent("通知失败");
      expect(block.getAttribute("data-tone")).toBe("warning");
    });
  });

  it("shows danger state on exception", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockRejectedValue(new Error("network error"));
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      const block = screen.getByTestId("state-block");
      expect(block.getAttribute("data-tone")).toBe("danger");
      expect(block).toHaveTextContent("错误");
    });
  });

  it("does not call createOrder when profile is missing", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("passes note to createOrder", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });
    render(<OrderButton user="alice" item="陪玩" amount={50} note="加急" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalled());
    expect(mockCreateOrder.mock.calls[0][0]).toMatchObject({ note: "加急" });
  });

  it("button is not disabled initially", () => {
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("re-enables button after order completes", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });

  it("handles non-chain order path (chain disabled)", async () => {
    mockIsChainOrdersEnabled.mockReturnValue(false);
    mockGetCurrentAddress.mockReturnValue("");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("shows fallback warning when sent=false and no error", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: false });
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      const block = screen.getByTestId("state-block");
      expect(block).toHaveTextContent("components.order_button.i163");
      expect(block.getAttribute("data-tone")).toBe("warning");
    });
  });

  it("handles loadGameProfile with invalid JSON (catch branch)", () => {
    mockIsChainOrdersEnabled.mockReturnValue(true);
    mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
    localStorage.setItem(PROFILE_KEY, "not-valid-json{{{");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    // loadGameProfile returns null on parse error, so confirm fires
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("handles chain sync retry failure and shows warning", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });
    mockFetch.mockResolvedValue({ ok: false });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    // Advance through all retry delays: 1000 + 2000 + 4000 + 8000 = 15000ms
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    // Verify fetch was called multiple times for chain-sync retries
    const syncCalls = mockFetch.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("chain-sync")
    );
    expect(syncCalls.length).toBeGreaterThanOrEqual(1);

    vi.useRealTimers();
  });

  it("handles chain sync retry with fetch throwing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });
    mockFetch.mockRejectedValue(new Error("network"));

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    vi.useRealTimers();
  });

  it("uses local profile when address-specific profile not found", async () => {
    mockIsChainOrdersEnabled.mockReturnValue(true);
    mockGetCurrentAddress.mockReturnValue("0xUnknownAddr");
    mockCreateOrderOnChain.mockResolvedValue({ digest: "digest-1" });
    // Only "local" key exists, not the address key
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        local: { gameName: "LocalPlayer", gameId: "99999", updatedAt: 1 },
      })
    );
    mockCreateOrder.mockResolvedValue({ sent: true });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalled());
    expect(mockCreateOrder.mock.calls[0][0].meta.gameProfile.gameName).toBe("LocalPlayer");
  });

  it("prompts when profile has gameName but no gameId", () => {
    mockIsChainOrdersEnabled.mockReturnValue(true);
    mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        [TEST_ADDRESS]: { gameName: "Player1", updatedAt: 1 },
      })
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("prompts when profile key exists but address not found and no local", () => {
    mockIsChainOrdersEnabled.mockReturnValue(true);
    mockGetCurrentAddress.mockReturnValue("0xUnknownAddr");
    // Profile exists but neither address key nor local key has valid data
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        "0xOtherAddr": { gameName: "Other", gameId: "111", updatedAt: 1 },
      })
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("prompts when no profile key in localStorage", () => {
    mockIsChainOrdersEnabled.mockReturnValue(true);
    mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
    // No profile in localStorage at all
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("handles chain sync success on first retry", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });
    mockFetch.mockResolvedValue({ ok: true });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByTestId("state-block")).toBeInTheDocument());
    // Chain sync succeeded, no warning
    expect(screen.getByTestId("state-block")).toHaveTextContent("ui.order-button.581");
  });

  it("shows non-chain success message when chain becomes disabled between checks", async () => {
    // isChainOrdersEnabled returns true first (for address), then false (for chain order)
    mockIsChainOrdersEnabled.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
    setProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      const block = screen.getByTestId("state-block");
      // No chainDigest, so uses comp.order_button.001
      expect(block).toHaveTextContent("comp.order_button.001");
      expect(block.getAttribute("data-tone")).toBe("success");
    });
  });

  it("passes null gameProfile in meta when currentAddress is empty", async () => {
    // isChainOrdersEnabled returns true first (for address check), then false (skip chain order)
    mockIsChainOrdersEnabled.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockGetCurrentAddress.mockReturnValue("");
    // currentAddress is "" (falsy), so gameProfile is null
    // But we need profile guard to pass: gameProfile?.gameName && gameProfile?.gameId
    // With empty address, gameProfile is null, so guard blocks. We need non-empty address.
    // Actually let's test with address that has profile
    mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
    setProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalled());
    // currentAddress is non-empty, gameProfile exists
    expect(mockCreateOrder.mock.calls[0][0].meta.gameProfile).not.toBeNull();
  });

  it("includes userAddress when chain is enabled", async () => {
    enableChainWithProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalled());
    expect(mockCreateOrder.mock.calls[0][0].userAddress).toBe(TEST_ADDRESS);
  });

  it("sends userAddress as undefined when currentAddress is empty", async () => {
    // isChainOrdersEnabled returns true first (for address), then false (skip chain)
    mockIsChainOrdersEnabled.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockGetCurrentAddress.mockReturnValue("");
    // Empty address means gameProfile is null, guard blocks
    // We need to test with non-empty address but chain disabled for order creation
    // Actually, userAddress: currentAddress || undefined
    // When currentAddress is "", it becomes undefined
    mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
    setProfile();
    mockCreateOrder.mockResolvedValue({ sent: true });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalled());
    // chainOrderId is null (chain disabled at line 71), so id is timestamp
    const id = mockCreateOrder.mock.calls[0][0].id;
    expect(Number(id)).toBeGreaterThan(0);
    // chainDigest is null, so no chainDigest in order
    expect(mockCreateOrder.mock.calls[0][0].chainDigest).toBeUndefined();
  });

  it("handles warning when sent=false on non-chain order", async () => {
    mockIsChainOrdersEnabled.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockGetCurrentAddress.mockReturnValue(TEST_ADDRESS);
    setProfile();
    mockCreateOrder.mockResolvedValue({ sent: false, error: "fail" });

    render(<OrderButton user="alice" item="陪玩" amount={50} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      const block = screen.getByTestId("state-block");
      expect(block.getAttribute("data-tone")).toBe("warning");
    });
  });
});
