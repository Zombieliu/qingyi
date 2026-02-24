import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  PASSKEY_STORAGE_KEY,
  PASSKEY_WALLETS_KEY,
  shortAddress,
  loadStoredWallet,
  saveStoredWallet,
  clearStoredWallet,
  loadWalletList,
  rememberWallet,
  removeWalletFromList,
  getPasskeyProviderOptions,
  type StoredWallet,
} from "../passkey-wallet";

describe("passkey-wallet utilities", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("shortAddress", () => {
    it("returns shortened address", () => {
      expect(shortAddress("0x1234567890abcdef")).toBe("0x1234...cdef");
    });

    it("returns empty string for empty input", () => {
      expect(shortAddress("")).toBe("");
    });
  });

  describe("loadStoredWallet", () => {
    it("returns null when nothing stored", () => {
      expect(loadStoredWallet()).toBeNull();
    });

    it("returns parsed wallet from localStorage", () => {
      const wallet: StoredWallet = { address: "0xabc", publicKey: "cHVia2V5" };
      localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));
      const result = loadStoredWallet();
      expect(result?.address).toBe("0xabc");
      expect(result?.publicKey).toBe("cHVia2V5");
    });

    it("returns null for invalid JSON", () => {
      localStorage.setItem(PASSKEY_STORAGE_KEY, "not-json");
      expect(loadStoredWallet()).toBeNull();
    });

    it("returns null for missing address", () => {
      localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify({ publicKey: "pk" }));
      expect(loadStoredWallet()).toBeNull();
    });
  });

  describe("saveStoredWallet", () => {
    it("saves wallet to localStorage and dispatches event", () => {
      const handler = vi.fn();
      window.addEventListener("passkey-updated", handler);
      const wallet: StoredWallet = { address: "0xabc", publicKey: "cHVia2V5" };
      const result = saveStoredWallet(wallet);
      expect(result).not.toBeNull();
      expect(result!.address).toBe("0xabc");
      expect(result!.createdAt).toBeDefined();
      expect(result!.lastUsedAt).toBeDefined();
      expect(handler).toHaveBeenCalled();
      window.removeEventListener("passkey-updated", handler);
    });

    it("preserves existing createdAt", () => {
      const wallet: StoredWallet = { address: "0xabc", publicKey: "pk", createdAt: 1000 };
      const result = saveStoredWallet(wallet);
      expect(result!.createdAt).toBe(1000);
    });
  });

  describe("clearStoredWallet", () => {
    it("removes wallet from localStorage", () => {
      localStorage.setItem(PASSKEY_STORAGE_KEY, "data");
      clearStoredWallet();
      expect(localStorage.getItem(PASSKEY_STORAGE_KEY)).toBeNull();
    });

    it("dispatches passkey-updated event", () => {
      const handler = vi.fn();
      window.addEventListener("passkey-updated", handler);
      clearStoredWallet();
      expect(handler).toHaveBeenCalled();
      window.removeEventListener("passkey-updated", handler);
    });
  });

  describe("loadWalletList", () => {
    it("returns empty array when nothing stored", () => {
      expect(loadWalletList()).toEqual([]);
    });

    it("returns parsed wallet list", () => {
      const list = [{ address: "0x1", publicKey: "pk1" }];
      localStorage.setItem(PASSKEY_WALLETS_KEY, JSON.stringify(list));
      expect(loadWalletList()).toEqual(list);
    });

    it("filters out invalid entries", () => {
      const list = [{ address: "0x1", publicKey: "pk1" }, { address: "" }, null];
      localStorage.setItem(PASSKEY_WALLETS_KEY, JSON.stringify(list));
      const result = loadWalletList();
      expect(result).toHaveLength(1);
    });

    it("returns empty for invalid JSON", () => {
      localStorage.setItem(PASSKEY_WALLETS_KEY, "bad");
      expect(loadWalletList()).toEqual([]);
    });
  });

  describe("rememberWallet", () => {
    it("adds wallet to list", () => {
      rememberWallet({ address: "0x1", publicKey: "pk1" });
      const list = loadWalletList();
      expect(list).toHaveLength(1);
      expect(list[0].address).toBe("0x1");
    });

    it("updates existing wallet in list", () => {
      rememberWallet({ address: "0x1", publicKey: "pk1", label: "old" });
      rememberWallet({ address: "0x1", publicKey: "pk1", label: "new" });
      const list = loadWalletList();
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe("new");
    });
  });

  describe("removeWalletFromList", () => {
    it("removes wallet by address", () => {
      rememberWallet({ address: "0x1", publicKey: "pk1" });
      rememberWallet({ address: "0x2", publicKey: "pk2" });
      removeWalletFromList("0x1");
      const list = loadWalletList();
      expect(list).toHaveLength(1);
      expect(list[0].address).toBe("0x2");
    });
  });

  describe("getPasskeyProviderOptions", () => {
    it("returns options with platform attachment by default", () => {
      const opts = getPasskeyProviderOptions();
      expect(opts.authenticatorSelection?.authenticatorAttachment).toBe("platform");
    });

    it("returns cross-platform for automation", () => {
      const opts = getPasskeyProviderOptions(true);
      expect(opts.authenticatorSelection?.authenticatorAttachment).toBe("cross-platform");
    });
  });

  describe("constants", () => {
    it("PASSKEY_STORAGE_KEY is correct", () => {
      expect(PASSKEY_STORAGE_KEY).toBe("qy_passkey_wallet_v3");
    });

    it("PASSKEY_WALLETS_KEY is correct", () => {
      expect(PASSKEY_WALLETS_KEY).toBe("qy_passkey_wallets_v1");
    });
  });
});

// --- Component tests for PasskeyWallet default export ---
vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

vi.mock("@/app/components/state-block", () => ({
  StateBlock: ({ tone, title }: { tone: string; title: string }) => (
    <div data-testid={`state-block-${tone}`}>{title}</div>
  ),
}));

const mockEnsureUserSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/user-auth-client", () => ({
  ensureUserSession: (...args: unknown[]) => mockEnsureUserSession(...args),
}));

const mockGetPasskeyInstance = vi.fn();
const mockSignAndRecover = vi.fn();
const mockFindCommonPublicKey = vi.fn();
const mockBrowserPasskeyProvider = vi.fn();

vi.mock("@mysten/sui/keypairs/passkey", () => {
  const MockBrowserPasskeyProvider = vi.fn(function () {
    return {};
  });
  return {
    PasskeyKeypair: {
      getPasskeyInstance: (...args: unknown[]) => mockGetPasskeyInstance(...args),
      signAndRecover: (...args: unknown[]) => mockSignAndRecover(...args),
    },
    BrowserPasskeyProvider: MockBrowserPasskeyProvider,
    findCommonPublicKey: (...args: unknown[]) => mockFindCommonPublicKey(...args),
  };
});

describe("PasskeyWallet component", () => {
  let PasskeyWallet: typeof import("../passkey-wallet").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();

    // Re-import to get fresh component
    const mod = await import("../passkey-wallet");
    PasskeyWallet = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // PLACEHOLDER_WALLET_COMPONENT_TESTS

  it("createPasskeyProvider returns a provider instance", async () => {
    vi.resetModules();
    const mod = await import("../passkey-wallet");
    const provider = mod.createPasskeyProvider();
    expect(provider).toBeDefined();
  });

  it("createPasskeyProvider with automation flag", async () => {
    vi.resetModules();
    const mod = await import("../passkey-wallet");
    const provider = mod.createPasskeyProvider(true);
    expect(provider).toBeDefined();
  });

  it("renders header and buttons", async () => {
    await act(async () => {
      render(<PasskeyWallet />);
    });
    expect(screen.getByText("ui.passkey-wallet.497")).toBeInTheDocument();
    expect(screen.getByText("comp.passkey_wallet.006")).toBeInTheDocument();
    expect(screen.getByText("comp.passkey_wallet.007")).toBeInTheDocument();
    expect(screen.getByText("comp.passkey_wallet.008")).toBeInTheDocument();
  });

  it("shows wallet list when wallets exist in localStorage", async () => {
    const wallets = [
      { address: "0x1111111111111111", publicKey: "pk1", lastUsedAt: Date.now() },
      { address: "0x2222222222222222", publicKey: "pk2", label: "MyWallet" },
    ];
    localStorage.setItem(PASSKEY_WALLETS_KEY, JSON.stringify(wallets));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    expect(screen.getByText("ui.passkey-wallet.499")).toBeInTheDocument();
    expect(screen.getByText("MyWallet")).toBeInTheDocument();
  });

  it("shows current wallet and reset button when wallet is stored", async () => {
    const wallet = { address: "0x1234567890abcdef", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    expect(screen.getByText(/0x1234...cdef/)).toBeInTheDocument();
    expect(screen.getByText("清除本地缓存")).toBeInTheDocument();
  });

  it("syncs on passkey-updated event", async () => {
    await act(async () => {
      render(<PasskeyWallet />);
    });

    // Store a wallet and fire event
    const wallet = { address: "0xabcdef1234567890", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));

    await act(async () => {
      window.dispatchEvent(new Event("passkey-updated"));
    });

    expect(screen.getByText(/0xabcd...7890/)).toBeInTheDocument();
  });

  it("syncs on storage event for passkey keys", async () => {
    await act(async () => {
      render(<PasskeyWallet />);
    });

    const wallet = { address: "0xabcdef1234567890", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: PASSKEY_STORAGE_KEY }));
    });

    expect(screen.getByText(/0xabcd...7890/)).toBeInTheDocument();
  });

  it("create: creates passkey and persists wallet", async () => {
    const fakePublicKey = {
      toSuiAddress: () => "0xnewaddress12345",
      toRawBytes: () => new Uint8Array([1, 2, 3]),
    };
    const fakeKeypair = { getPublicKey: () => fakePublicKey };
    mockGetPasskeyInstance.mockResolvedValue(fakeKeypair);

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const createBtn = screen.getByText("comp.passkey_wallet.007");
    await act(async () => {
      fireEvent.click(createBtn);
    });

    // Should show success message
    await waitFor(() => {
      expect(screen.getByTestId("state-block-success")).toBeInTheDocument();
    });
  });

  it("create: shows error on failure", async () => {
    mockGetPasskeyInstance.mockRejectedValue(new Error("user cancelled"));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const createBtn = screen.getByText("comp.passkey_wallet.007");
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-block-danger")).toHaveTextContent("user cancelled");
    });
  });

  it("login: shows error when no wallet available", async () => {
    await act(async () => {
      render(<PasskeyWallet />);
    });

    const loginBtn = screen.getByText("comp.passkey_wallet.006");
    await act(async () => {
      fireEvent.click(loginBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-block-danger")).toHaveTextContent("comp.passkey_wallet.002");
    });
  });

  it("login: logs in with stored wallet", async () => {
    const wallet = { address: "0x1234567890abcdef", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const loginBtn = screen.getByText("comp.passkey_wallet.006");
    await act(async () => {
      fireEvent.click(loginBtn);
    });

    expect(mockEnsureUserSession).toHaveBeenCalledWith("0x1234567890abcdef");
  });

  it("login: shows missing credential error", async () => {
    const wallet = { address: "0x1234567890abcdef", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));
    mockEnsureUserSession.mockRejectedValueOnce(
      Object.assign(new Error("No passkeys found"), { name: "NotFoundError" })
    );

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const loginBtn = screen.getByText("comp.passkey_wallet.006");
    await act(async () => {
      fireEvent.click(loginBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-block-danger")).toHaveTextContent("comp.passkey_wallet.004");
    });
  });

  it("login: shows generic error on non-credential failure", async () => {
    const wallet = { address: "0x1234567890abcdef", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));
    mockEnsureUserSession.mockRejectedValueOnce(new Error("network error"));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const loginBtn = screen.getByText("comp.passkey_wallet.006");
    await act(async () => {
      fireEvent.click(loginBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-block-danger")).toHaveTextContent("network error");
    });
  });

  it("login with specific wallet from list", async () => {
    const wallets = [{ address: "0x1111111111111111", publicKey: "pk1" }];
    localStorage.setItem(PASSKEY_WALLETS_KEY, JSON.stringify(wallets));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const useBtn = screen.getByText("使用");
    await act(async () => {
      fireEvent.click(useBtn);
    });

    expect(mockEnsureUserSession).toHaveBeenCalledWith("0x1111111111111111");
  });

  it("remove wallet from list", async () => {
    const wallets = [
      { address: "0x1111111111111111", publicKey: "pk1" },
      { address: "0x2222222222222222", publicKey: "pk2" },
    ];
    localStorage.setItem(PASSKEY_WALLETS_KEY, JSON.stringify(wallets));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const removeBtns = screen.getAllByText("移除");
    await act(async () => {
      fireEvent.click(removeBtns[0]);
    });

    // After removal, wallet list should update
    const list = loadWalletList();
    expect(list).toHaveLength(1);
    expect(list[0].address).toBe("0x2222222222222222");
  });

  it("recover: recovers passkey and persists wallet", async () => {
    const fakePk = {
      toSuiAddress: () => "0xrecovered1234567",
      toRawBytes: () => new Uint8Array([4, 5, 6]),
    };
    mockSignAndRecover.mockResolvedValue(["pk1", "pk2"]);
    mockFindCommonPublicKey.mockReturnValue(fakePk);

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const recoverBtn = screen.getByText("comp.passkey_wallet.008");
    await act(async () => {
      fireEvent.click(recoverBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-block-success")).toBeInTheDocument();
    });
  });

  it("recover: shows error on failure", async () => {
    mockSignAndRecover.mockRejectedValue(new Error("recover failed"));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const recoverBtn = screen.getByText("comp.passkey_wallet.008");
    await act(async () => {
      fireEvent.click(recoverBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-block-danger")).toHaveTextContent("recover failed");
    });
  });

  it("reset: clears wallet and calls session DELETE", async () => {
    const wallet = { address: "0x1234567890abcdef", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(new Response("ok"));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const resetBtn = screen.getByText("清除本地缓存");
    await act(async () => {
      fireEvent.click(resetBtn);
    });

    expect(localStorage.getItem(PASSKEY_STORAGE_KEY)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/session", { method: "DELETE" });
    fetchSpy.mockRestore();
  });

  it("reset: handles fetch error gracefully", async () => {
    const wallet = { address: "0x1234567890abcdef", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));
    const fetchSpy = vi.spyOn(window, "fetch").mockRejectedValue(new Error("fail"));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const resetBtn = screen.getByText("清除本地缓存");
    // Should not throw
    await act(async () => {
      fireEvent.click(resetBtn);
    });

    expect(localStorage.getItem(PASSKEY_STORAGE_KEY)).toBeNull();
    fetchSpy.mockRestore();
  });

  it("shows hasCredential hint when PublicKeyCredential is available", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).PublicKeyCredential = {
      isConditionalMediationAvailable: vi.fn().mockResolvedValue(true),
    };

    await act(async () => {
      render(<PasskeyWallet />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Passkey/)).toBeInTheDocument();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).PublicKeyCredential;
  });

  it("shows busy overlay during operations", async () => {
    // Make create hang
    let resolveCreate: (v: unknown) => void;
    mockGetPasskeyInstance.mockImplementation(
      () =>
        new Promise((r) => {
          resolveCreate = r;
        })
    );

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const createBtn = screen.getByText("comp.passkey_wallet.007");
    act(() => {
      fireEvent.click(createBtn);
    });

    // Should show busy text
    await waitFor(() => {
      expect(screen.getByText("ui.passkey-wallet.500")).toBeInTheDocument();
    });

    // Resolve to clean up
    const fakePublicKey = {
      toSuiAddress: () => "0xaddr",
      toRawBytes: () => new Uint8Array([1]),
    };
    await act(async () => {
      resolveCreate!({ getPublicKey: () => fakePublicKey });
    });
  });

  it("message auto-clears after timeout", async () => {
    const wallet = { address: "0x1234567890abcdef", publicKey: "pk1" };
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(wallet));

    await act(async () => {
      render(<PasskeyWallet />);
    });

    const loginBtn = screen.getByText("comp.passkey_wallet.006");
    await act(async () => {
      fireEvent.click(loginBtn);
    });

    // Message should be visible
    await waitFor(() => {
      expect(screen.getByTestId("state-block-success")).toBeInTheDocument();
    });

    // Wait for the 3s timeout to clear message
    await waitFor(
      () => {
        expect(screen.queryByTestId("state-block-success")).not.toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  });
});
