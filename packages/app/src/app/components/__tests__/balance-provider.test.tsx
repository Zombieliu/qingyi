import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { Provider as JotaiProvider } from "jotai";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

vi.mock("./passkey-wallet", () => ({
  PASSKEY_STORAGE_KEY: "qy_passkey_wallet_v3",
}));

vi.mock("@/lib/atoms/balance-atom", () => ({
  useBalance: () => ({
    balance: "100",
    loading: false,
    refresh: mocks.refresh,
  }),
}));

import { BalanceProvider } from "../balance-provider";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <JotaiProvider>{children}</JotaiProvider>;
}

describe("BalanceProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue("/home");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children", () => {
    const { getByText } = render(
      <Wrapper>
        <BalanceProvider>
          <span>child</span>
        </BalanceProvider>
      </Wrapper>
    );
    expect(getByText("child")).toBeInTheDocument();
  });

  it("calls refresh on mount for non-admin route", () => {
    render(
      <Wrapper>
        <BalanceProvider>
          <div />
        </BalanceProvider>
      </Wrapper>
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("does not call refresh on admin route", () => {
    mocks.usePathname.mockReturnValue("/admin/dashboard");
    render(
      <Wrapper>
        <BalanceProvider>
          <div />
        </BalanceProvider>
      </Wrapper>
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes on passkey-updated event", () => {
    mocks.usePathname.mockReturnValue("/wallet");
    render(
      <Wrapper>
        <BalanceProvider>
          <div />
        </BalanceProvider>
      </Wrapper>
    );
    mocks.refresh.mockClear();
    window.dispatchEvent(new Event("passkey-updated"));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("refreshes on storage event with passkey key", () => {
    mocks.usePathname.mockReturnValue("/wallet");
    render(
      <Wrapper>
        <BalanceProvider>
          <div />
        </BalanceProvider>
      </Wrapper>
    );
    mocks.refresh.mockClear();
    window.dispatchEvent(new StorageEvent("storage", { key: "qy_passkey_wallet_v3" }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("ignores storage events with other keys", () => {
    mocks.usePathname.mockReturnValue("/wallet");
    render(
      <Wrapper>
        <BalanceProvider>
          <div />
        </BalanceProvider>
      </Wrapper>
    );
    mocks.refresh.mockClear();
    window.dispatchEvent(new StorageEvent("storage", { key: "other_key" }));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
