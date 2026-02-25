import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──
const { mockGetBalance, mockToSuiAddress, mockSendAlert } = vi.hoisted(() => {
  return {
    mockGetBalance: vi.fn(),
    mockToSuiAddress: vi.fn(() => "0x" + "ab".repeat(32)),
    mockSendAlert: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@mysten/sui/client", () => {
  function MockSuiClient() {
    return { getBalance: mockGetBalance };
  }
  return {
    SuiClient: MockSuiClient,
    getFullnodeUrl: vi.fn(() => "https://fullnode.testnet.sui.io"),
  };
});

vi.mock("@mysten/sui/keypairs/ed25519", () => ({
  Ed25519Keypair: {
    fromSecretKey: vi.fn(() => ({
      toSuiAddress: mockToSuiAddress,
    })),
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    SUI_RPC_URL: "https://test-rpc.example.com",
    NEXT_PUBLIC_SUI_RPC_URL: "",
    SUI_NETWORK: "testnet",
    SUI_SPONSOR_PRIVATE_KEY: "test-sponsor-key",
    SUI_ADMIN_PRIVATE_KEY: "",
  },
}));

vi.mock("@/lib/services/alert-service", () => ({
  sendAlert: mockSendAlert,
}));

import { getSponsorBalance, checkSponsorBalance } from "../sponsor-monitor";

const SPONSOR_ADDR = "0x" + "ab".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  mockToSuiAddress.mockReturnValue(SPONSOR_ADDR);
});

// ── getSponsorBalance ──

describe("getSponsorBalance", () => {
  it("returns balance as bigint", async () => {
    mockGetBalance.mockResolvedValue({ totalBalance: "5000000000" });
    const balance = await getSponsorBalance();
    expect(balance).toBe(5_000_000_000n);
  });
});

// ── checkSponsorBalance ──

describe("checkSponsorBalance", () => {
  it("returns ok when balance is above thresholds", async () => {
    // 10 SUI
    mockGetBalance.mockResolvedValue({ totalBalance: "10000000000" });
    const result = await checkSponsorBalance();
    expect(result.status).toBe("ok");
    expect(result.alerted).toBe(false);
    expect(result.address).toBe(SPONSOR_ADDR);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it("returns warning when balance is below warning threshold", async () => {
    // 1.5 SUI — below default warning (2) but above critical (1)
    mockGetBalance.mockResolvedValue({ totalBalance: "1500000000" });
    const result = await checkSponsorBalance();
    expect(result.status).toBe("warning");
    expect(result.alerted).toBe(true);
    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warning", metric: "sponsor_balance" })
    );
  });

  it("returns critical when balance is below critical threshold", async () => {
    // 0.5 SUI
    mockGetBalance.mockResolvedValue({ totalBalance: "500000000" });
    const result = await checkSponsorBalance();
    expect(result.status).toBe("critical");
    expect(result.alerted).toBe(true);
    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: "critical", metric: "sponsor_balance" })
    );
  });

  it("returns critical when balance is zero", async () => {
    mockGetBalance.mockResolvedValue({ totalBalance: "0" });
    const result = await checkSponsorBalance();
    expect(result.status).toBe("critical");
    expect(result.alerted).toBe(true);
  });

  it("respects custom thresholds", async () => {
    // 3 SUI — ok with default thresholds, but warning with custom (5, 2)
    mockGetBalance.mockResolvedValue({ totalBalance: "3000000000" });
    const result = await checkSponsorBalance(5, 2);
    expect(result.status).toBe("warning");
    expect(result.alerted).toBe(true);
  });

  it("returns balanceSui as formatted string", async () => {
    mockGetBalance.mockResolvedValue({ totalBalance: "1234567890" });
    const result = await checkSponsorBalance();
    expect(result.balanceSui).toBe("1.2346");
    expect(result.balanceMist).toBe("1234567890");
  });

  it("throws when sponsor key is missing", async () => {
    vi.resetModules();
    vi.doMock("@mysten/sui/client", () => ({
      SuiClient: function MockSuiClient() {
        return { getBalance: vi.fn() };
      },
      getFullnodeUrl: vi.fn(() => "https://fullnode.testnet.sui.io"),
    }));
    vi.doMock("@mysten/sui/keypairs/ed25519", () => ({
      Ed25519Keypair: { fromSecretKey: vi.fn() },
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        SUI_RPC_URL: "https://test-rpc.example.com",
        NEXT_PUBLIC_SUI_RPC_URL: "",
        SUI_NETWORK: "testnet",
        SUI_SPONSOR_PRIVATE_KEY: "",
        SUI_ADMIN_PRIVATE_KEY: "",
      },
    }));
    vi.doMock("@/lib/services/alert-service", () => ({
      sendAlert: vi.fn(),
    }));
    const mod = await import("../sponsor-monitor");
    await expect(mod.checkSponsorBalance()).rejects.toThrow("Missing SUI_SPONSOR_PRIVATE_KEY");
  });
});
