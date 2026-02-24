import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/i18n/i18n-client", () => ({
  useI18n: () => ({
    locale: "zh",
    setLocale: vi.fn(),
    t: (k: string) => k,
  }),
}));

const mockGetPasskeyInstance = vi.fn();
const mockSignAndRecover = vi.fn();
const mockFindCommonPublicKey = vi.fn();
vi.mock("@mysten/sui/keypairs/passkey", () => {
  const Mock = vi.fn(function () {
    return {};
  });
  return {
    PasskeyKeypair: {
      getPasskeyInstance: (...args: unknown[]) => mockGetPasskeyInstance(...args),
      signAndRecover: (...args: unknown[]) => mockSignAndRecover(...args),
    },
    BrowserPasskeyProvider: Mock,
    findCommonPublicKey: (...args: unknown[]) => mockFindCommonPublicKey(...args),
  };
});

const mockTrackEvent = vi.fn();
vi.mock("@/lib/services/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const mockEnsureUserSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/user-auth-client", () => ({
  ensureUserSession: (...args: unknown[]) => mockEnsureUserSession(...args),
}));

const mockLoadStoredWallet = vi.fn(() => null);
const mockLoadWalletList = vi.fn(() => [] as unknown[]);
const mockSaveStoredWallet = vi.fn((w: unknown) => w);
const mockRemoveWalletFromList = vi.fn();

vi.mock("../passkey-wallet", () => ({
  PASSKEY_STORAGE_KEY: "qy_passkey_wallet_v3",
  PASSKEY_WALLETS_KEY: "qy_passkey_wallets_v1",
  getPasskeyProviderOptions: vi.fn(() => ({ rp: {} })),
  loadStoredWallet: (...args: unknown[]) => mockLoadStoredWallet(...args),
  loadWalletList: (...args: unknown[]) => mockLoadWalletList(...args),
  removeWalletFromList: (...args: unknown[]) => mockRemoveWalletFromList(...args),
  saveStoredWallet: (...args: unknown[]) => mockSaveStoredWallet(...args),
  shortAddress: vi.fn((a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`),
}));

import PasskeyLoginButton from "../passkey-login-button";

describe("PasskeyLoginButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockLoadStoredWallet.mockReturnValue(null);
    mockLoadWalletList.mockReturnValue([]);
    mockSaveStoredWallet.mockImplementation((w: unknown) => w);
    mockEnsureUserSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders login button", async () => {
    await act(async () => {
      render(<PasskeyLoginButton />);
    });
    expect(screen.getByText("passkey.login")).toBeInTheDocument();
  });

  it("renders register and recover buttons", async () => {
    await act(async () => {
      render(<PasskeyLoginButton />);
    });
    expect(screen.getByText("passkey.register")).toBeInTheDocument();
    expect(screen.getByText("passkey.recover")).toBeInTheDocument();
  });

  it("does not show wallet list when empty", async () => {
    await act(async () => {
      render(<PasskeyLoginButton />);
    });
    expect(screen.queryByText("passkey.recent")).not.toBeInTheDocument();
  });

  it("shows wallet list when wallets exist", async () => {
    mockLoadWalletList.mockReturnValue([
      { address: "0x1111111111111111", publicKey: "pk1", lastUsedAt: Date.now() },
      { address: "0x2222222222222222", publicKey: "pk2", label: "MyWallet" },
    ]);
    await act(async () => {
      render(<PasskeyLoginButton />);
    });
    expect(screen.getByText("passkey.recent")).toBeInTheDocument();
    expect(screen.getByText("MyWallet")).toBeInTheDocument();
  });

  it("shows hasCredential hint when available", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).PublicKeyCredential = {
      isConditionalMediationAvailable: vi.fn().mockResolvedValue(true),
    };
    await act(async () => {
      render(<PasskeyLoginButton />);
    });
    await waitFor(() => {
      expect(screen.getByText("passkey.hint")).toBeInTheDocument();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).PublicKeyCredential;
  });

  // PLACEHOLDER_SIGNIN_DESCRIBE_BLOCKS

  describe("loginWithWallet", () => {
    it("shows error when no wallet available", async () => {
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      expect(screen.getByText("passkey.error.nowallet")).toBeInTheDocument();
    });

    it("logs in with stored wallet and navigates to /home", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      expect(mockTrackEvent).toHaveBeenCalledWith("login_click", {
        method: "passkey",
        stage: "signin",
      });
      expect(mockSaveStoredWallet).toHaveBeenCalled();
      expect(mockEnsureUserSession).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/home");
    });

    it("shows missing credential error for NotFoundError", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockSaveStoredWallet.mockImplementation(() => {
        throw Object.assign(new Error("No passkeys found"), { name: "NotFoundError" });
      });
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      expect(screen.getByText("passkey.error.missing")).toBeInTheDocument();
      expect(mockTrackEvent).toHaveBeenCalledWith(
        "login_failed",
        expect.objectContaining({ stage: "signin" })
      );
    });

    it("shows generic error on non-credential failure", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockSaveStoredWallet.mockImplementation(() => {
        throw new Error("network error");
      });
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      expect(screen.getByText("network error")).toBeInTheDocument();
    });

    it("logs in with specific wallet from list", async () => {
      mockLoadWalletList.mockReturnValue([{ address: "0x1111111111111111", publicKey: "pk1" }]);
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const useBtn = screen.getByText("passkey.use");
      await act(async () => {
        fireEvent.click(useBtn);
      });

      expect(mockSaveStoredWallet).toHaveBeenCalledWith(
        expect.objectContaining({ address: "0x1111111111111111" })
      );
      expect(mockPush).toHaveBeenCalledWith("/home");
    });

    it("removes wallet from list", async () => {
      mockLoadWalletList.mockReturnValue([{ address: "0x1111111111111111", publicKey: "pk1" }]);
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const removeBtn = screen.getByText("passkey.remove");
      fireEvent.click(removeBtn);
      expect(mockRemoveWalletFromList).toHaveBeenCalledWith("0x1111111111111111");
    });
  });

  describe("createPasskey", () => {
    it("creates passkey and navigates to /home", async () => {
      const fakePublicKey = {
        toSuiAddress: () => "0xnewaddr",
        toRawBytes: () => new Uint8Array([1, 2, 3]),
      };
      mockGetPasskeyInstance.mockResolvedValue({ getPublicKey: () => fakePublicKey });

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const createBtn = screen.getByText("passkey.register");
      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(mockTrackEvent).toHaveBeenCalledWith("passkey_created", { method: "passkey" });
      expect(mockSaveStoredWallet).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/home");
    });

    it("shows error on create failure", async () => {
      mockGetPasskeyInstance.mockRejectedValue(new Error("user cancelled"));

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const createBtn = screen.getByText("passkey.register");
      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(screen.getByText("user cancelled")).toBeInTheDocument();
      expect(mockTrackEvent).toHaveBeenCalledWith(
        "login_failed",
        expect.objectContaining({ stage: "register" })
      );
    });
  });

  describe("persist edge cases", () => {
    it("does nothing when saveStoredWallet returns null", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockSaveStoredWallet.mockReturnValue(null);
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      // Should not navigate when saveStoredWallet returns null
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("handles ensureUserSession failure gracefully", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockEnsureUserSession.mockRejectedValue(new Error("session error"));
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      // Should still navigate despite session error
      expect(mockPush).toHaveBeenCalledWith("/home");
    });

    it("handles referral bind failure gracefully", async () => {
      localStorage.setItem("qy:refCode", "VALID123");
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      const fetchSpy = vi.spyOn(window, "fetch").mockRejectedValue(new Error("network"));
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      // Should still navigate despite referral bind failure
      expect(mockPush).toHaveBeenCalledWith("/home");
      fetchSpy.mockRestore();
    });
  });

  describe("createPasskey edge cases", () => {
    it("shows fallback error message when error has no message", async () => {
      mockGetPasskeyInstance.mockRejectedValue({});
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const createBtn = screen.getByText("passkey.register");
      await act(async () => {
        fireEvent.click(createBtn);
      });
      expect(screen.getByText("passkey.error")).toBeInTheDocument();
    });
  });

  describe("recoverPasskey edge cases", () => {
    it("shows fallback error message when error has no message", async () => {
      mockSignAndRecover.mockRejectedValue({});
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const recoverBtn = screen.getByText("passkey.recover");
      await act(async () => {
        fireEvent.click(recoverBtn);
      });
      expect(screen.getByText("passkey.error")).toBeInTheDocument();
    });
  });

  // PLACEHOLDER_SIGNIN_MORE_BLOCKS

  describe("recoverPasskey", () => {
    it("recovers passkey and navigates to /home", async () => {
      const fakePk = {
        toSuiAddress: () => "0xrecovered",
        toRawBytes: () => new Uint8Array([4, 5, 6]),
      };
      mockSignAndRecover.mockResolvedValue(["pk1", "pk2"]);
      mockFindCommonPublicKey.mockReturnValue(fakePk);

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const recoverBtn = screen.getByText("passkey.recover");
      await act(async () => {
        fireEvent.click(recoverBtn);
      });

      expect(mockSaveStoredWallet).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/home");
    });

    it("shows error on recover failure", async () => {
      mockSignAndRecover.mockRejectedValue(new Error("recover failed"));

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const recoverBtn = screen.getByText("passkey.recover");
      await act(async () => {
        fireEvent.click(recoverBtn);
      });

      expect(screen.getByText("recover failed")).toBeInTheDocument();
      expect(mockTrackEvent).toHaveBeenCalledWith(
        "login_failed",
        expect.objectContaining({ stage: "recover" })
      );
    });
  });

  describe("persist - referral binding", () => {
    it("binds referral code when qy:refCode exists", async () => {
      localStorage.setItem("qy:refCode", "ABC123");
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(new Response("ok"));

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/referral/bind",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(localStorage.getItem("qy:refCode")).toBeNull();
      fetchSpy.mockRestore();
    });

    it("does not bind referral when refCode is too short", async () => {
      localStorage.setItem("qy:refCode", "AB");
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(new Response("ok"));

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      const referralCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes("/api/referral/bind")
      );
      expect(referralCalls).toHaveLength(0);
      fetchSpy.mockRestore();
    });

    it("does not bind referral when no refCode", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(new Response("ok"));

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });

      const referralCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes("/api/referral/bind")
      );
      expect(referralCalls).toHaveLength(0);
      fetchSpy.mockRestore();
    });
  });

  describe("overlay", () => {
    it("shows overlay during login", async () => {
      let resolveSession: (v: unknown) => void;
      mockEnsureUserSession.mockImplementation(
        () =>
          new Promise((r) => {
            resolveSession = r;
          })
      );
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });

      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      act(() => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByText("passkey.overlay")).toBeInTheDocument();
      });

      await act(async () => {
        resolveSession!(undefined);
      });

      expect(screen.queryByText("passkey.overlay")).not.toBeInTheDocument();
    });
  });

  describe("syncs on events", () => {
    it("syncs on passkey-updated event", async () => {
      await act(async () => {
        render(<PasskeyLoginButton />);
      });

      mockLoadWalletList.mockReturnValue([{ address: "0x3333333333333333", publicKey: "pk3" }]);

      await act(async () => {
        window.dispatchEvent(new Event("passkey-updated"));
      });

      expect(screen.getByText("passkey.recent")).toBeInTheDocument();
    });

    it("syncs on storage event for passkey keys", async () => {
      await act(async () => {
        render(<PasskeyLoginButton />);
      });

      mockLoadWalletList.mockReturnValue([{ address: "0x4444444444444444", publicKey: "pk4" }]);

      await act(async () => {
        window.dispatchEvent(new StorageEvent("storage", { key: "qy_passkey_wallet_v3" }));
      });

      expect(screen.getByText("passkey.recent")).toBeInTheDocument();
    });

    it("syncs on storage event for wallets key", async () => {
      await act(async () => {
        render(<PasskeyLoginButton />);
      });

      mockLoadWalletList.mockReturnValue([{ address: "0x5555555555555555", publicKey: "pk5" }]);

      await act(async () => {
        window.dispatchEvent(new StorageEvent("storage", { key: "qy_passkey_wallets_v1" }));
      });

      expect(screen.getByText("passkey.recent")).toBeInTheDocument();
    });

    it("ignores storage events for unrelated keys", async () => {
      await act(async () => {
        render(<PasskeyLoginButton />);
      });

      await act(async () => {
        window.dispatchEvent(new StorageEvent("storage", { key: "unrelated_key" }));
      });

      expect(screen.queryByText("passkey.recent")).not.toBeInTheDocument();
    });
  });

  describe("credential check", () => {
    it("handles isConditionalMediationAvailable throwing", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).PublicKeyCredential = {
        isConditionalMediationAvailable: vi.fn().mockRejectedValue(new Error("not supported")),
      };
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      // Should not show hint when check fails
      expect(screen.queryByText("passkey.hint")).not.toBeInTheDocument();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).PublicKeyCredential;
    });

    it("handles missing isConditionalMediationAvailable", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).PublicKeyCredential = {};
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      expect(screen.queryByText("passkey.hint")).not.toBeInTheDocument();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).PublicKeyCredential;
    });
  });

  describe("isMissingCredential edge cases", () => {
    it("detects 'not found' in error message", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockSaveStoredWallet.mockImplementation(() => {
        throw new Error("credential not found");
      });
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      expect(screen.getByText("passkey.error.missing")).toBeInTheDocument();
    });

    it("detects 'No credentials' in error message", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockSaveStoredWallet.mockImplementation(() => {
        throw new Error("No credentials available");
      });
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      expect(screen.getByText("passkey.error.missing")).toBeInTheDocument();
    });

    it("handles error with no message property (fallback to empty string)", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockSaveStoredWallet.mockImplementation(() => {
        throw { name: "NotFoundError" };
      });
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      expect(screen.getByText("passkey.error.missing")).toBeInTheDocument();
    });
  });

  describe("loginWithWallet fallback error message", () => {
    it("shows fallback error when error has no message", async () => {
      mockLoadStoredWallet.mockReturnValue({ address: "0xabc123", publicKey: "pk" });
      mockSaveStoredWallet.mockImplementation(() => {
        throw {};
      });
      await act(async () => {
        render(<PasskeyLoginButton />);
      });
      const loginBtn = screen.getByText("passkey.login");
      await act(async () => {
        fireEvent.click(loginBtn);
      });
      expect(screen.getByText("passkey.error")).toBeInTheDocument();
    });
  });

  describe("cleanup on unmount", () => {
    it("cleans up event listeners on unmount", async () => {
      const removeSpy = vi.spyOn(window, "removeEventListener");
      let unmountFn: () => void;
      await act(async () => {
        const result = render(<PasskeyLoginButton />);
        unmountFn = result.unmount;
      });
      act(() => {
        unmountFn!();
      });
      expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith("passkey-updated", expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
