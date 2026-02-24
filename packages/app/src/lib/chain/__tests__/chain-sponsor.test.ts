import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──
const {
  mockBuild,
  mockSetSender,
  mockSetGasOwner,
  mockSetGasBudget,
  mockGetData,
  mockFromKind,
  mockFromBytes,
  mockExecuteTransactionBlock,
  mockSignTransaction,
  mockToSuiAddress,
} = vi.hoisted(() => {
  const mockBuild = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
  const mockSetSender = vi.fn();
  const mockSetGasOwner = vi.fn();
  const mockSetGasBudget = vi.fn();
  const mockGetData = vi.fn();
  const txObj = () => ({
    setSender: mockSetSender,
    setGasOwner: mockSetGasOwner,
    setGasBudget: mockSetGasBudget,
    getData: mockGetData,
    build: mockBuild,
  });
  const mockFromKind = vi.fn(txObj);
  const mockFromBytes = vi.fn(txObj);
  const mockExecuteTransactionBlock = vi.fn();
  const mockSignTransaction = vi.fn().mockResolvedValue({ signature: "sponsor-sig" });
  const mockToSuiAddress = vi.fn(() => "0x" + "sp".repeat(32));
  return {
    mockBuild,
    mockSetSender,
    mockSetGasOwner,
    mockSetGasBudget,
    mockGetData,
    mockFromKind,
    mockFromBytes,
    mockExecuteTransactionBlock,
    mockSignTransaction,
    mockToSuiAddress,
  };
});

vi.mock("@mysten/sui/transactions", () => ({
  Transaction: {
    fromKind: mockFromKind,
    from: mockFromBytes,
  },
}));

vi.mock("@mysten/sui/client", () => {
  function MockSuiClient() {
    return { executeTransactionBlock: mockExecuteTransactionBlock };
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
      signTransaction: mockSignTransaction,
    })),
  },
}));

const MOCK_PKG = "0x" + "ab".repeat(32);
const NORMALIZED_PKG = MOCK_PKG.toLowerCase();

vi.mock("@mysten/sui/utils", () => ({
  fromBase64: vi.fn(() => new Uint8Array([1, 2, 3])),
  toBase64: vi.fn(() => "base64bytes"),
  normalizeSuiAddress: (addr: string) => {
    if (!addr) return "0x" + "0".repeat(64);
    if (addr.startsWith("0x") && addr.length === 66) return addr.toLowerCase();
    return "0x" + addr.replace(/^0x/, "").padStart(64, "0").toLowerCase();
  },
  isValidSuiAddress: (addr: string) =>
    typeof addr === "string" && addr.startsWith("0x") && addr.length === 66,
}));

vi.mock("contracts/deployment", () => ({
  PACKAGE_ID: "0x" + "ab".repeat(32),
}));

vi.mock("@/lib/env", () => ({
  env: {
    SUI_RPC_URL: "https://test-rpc.example.com",
    NEXT_PUBLIC_SUI_RPC_URL: "",
    SUI_NETWORK: "testnet",
    SUI_SPONSOR_PRIVATE_KEY: "test-sponsor-key",
    SUI_ADMIN_PRIVATE_KEY: "test-admin-key",
    SUI_SPONSOR_GAS_BUDGET: 50_000_000,
  },
}));

import { buildSponsoredTransactionFromKind, executeSponsoredTransaction } from "../chain-sponsor";

const VALID_SENDER = "0x" + "aa".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  mockToSuiAddress.mockReturnValue("0x" + "sp".repeat(32));
});

// ── buildSponsoredTransactionFromKind ──

describe("buildSponsoredTransactionFromKind", () => {
  it("builds a sponsored transaction successfully", async () => {
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
    });

    const result = await buildSponsoredTransactionFromKind({
      sender: VALID_SENDER,
      kindBytes: "base64kind",
    });

    expect(result.bytes).toBe("base64bytes");
    expect(result.sender).toBe(VALID_SENDER.toLowerCase());
    expect(result.gasBudget).toBe(50_000_000);
  });

  it("validates sender address format", async () => {
    // With our mock, all addresses get normalized to valid format
    // Test that the function proceeds with a valid sender
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
    });
    const result = await buildSponsoredTransactionFromKind({
      sender: VALID_SENDER,
      kindBytes: "base64kind",
    });
    expect(result.sender).toBe(VALID_SENDER.toLowerCase());
  });

  it("throws when transaction has no commands", async () => {
    mockGetData.mockReturnValue({ commands: [], sender: VALID_SENDER });

    await expect(
      buildSponsoredTransactionFromKind({ sender: VALID_SENDER, kindBytes: "base64kind" })
    ).rejects.toThrow("Transaction has no commands");
  });

  it("throws for non-MoveCall commands", async () => {
    mockGetData.mockReturnValue({
      commands: [{ $kind: "TransferObjects" }],
      sender: VALID_SENDER,
    });

    await expect(
      buildSponsoredTransactionFromKind({ sender: VALID_SENDER, kindBytes: "base64kind" })
    ).rejects.toThrow("Only MoveCall commands are allowed");
  });

  it("throws for disallowed MoveCall target", async () => {
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: { package: NORMALIZED_PKG, module: "evil_module", function: "steal" },
        },
      ],
      sender: VALID_SENDER,
    });

    await expect(
      buildSponsoredTransactionFromKind({ sender: VALID_SENDER, kindBytes: "base64kind" })
    ).rejects.toThrow("MoveCall target not allowed");
  });

  it("throws for invalid sender in ensureAllowedSponsoredTransaction", async () => {
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: "", // empty sender
    });

    await expect(
      buildSponsoredTransactionFromKind({ sender: VALID_SENDER, kindBytes: "base64kind" })
    ).rejects.toThrow("Invalid sender");
  });

  it("throws for invalid sender address in buildSponsoredTransactionFromKind", async () => {
    vi.resetModules();
    const localMockGetData = vi.fn();
    const localTxObj = () => ({
      setSender: vi.fn(),
      setGasOwner: vi.fn(),
      setGasBudget: vi.fn(),
      getData: localMockGetData,
      build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    });
    vi.doMock("@mysten/sui/transactions", () => ({
      Transaction: { fromKind: vi.fn(localTxObj), from: vi.fn(localTxObj) },
    }));
    vi.doMock("@mysten/sui/client", () => ({
      SuiClient: function MockSuiClient() {
        return { executeTransactionBlock: vi.fn() };
      },
      getFullnodeUrl: vi.fn(() => "https://fullnode.testnet.sui.io"),
    }));
    vi.doMock("@mysten/sui/keypairs/ed25519", () => ({
      Ed25519Keypair: {
        fromSecretKey: vi.fn(() => ({
          toSuiAddress: vi.fn(() => "0x" + "sp".repeat(32)),
          signTransaction: vi.fn().mockResolvedValue({ signature: "sig" }),
        })),
      },
    }));
    vi.doMock("@mysten/sui/utils", () => ({
      fromBase64: vi.fn(() => new Uint8Array([1, 2, 3])),
      toBase64: vi.fn(() => "base64bytes"),
      normalizeSuiAddress: () => "invalid",
      isValidSuiAddress: () => false,
    }));
    vi.doMock("contracts/deployment", () => ({
      PACKAGE_ID: "0x" + "ab".repeat(32),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        SUI_RPC_URL: "https://test-rpc.example.com",
        NEXT_PUBLIC_SUI_RPC_URL: "",
        SUI_NETWORK: "testnet",
        SUI_SPONSOR_PRIVATE_KEY: "test-sponsor-key",
        SUI_ADMIN_PRIVATE_KEY: "test-admin-key",
        SUI_SPONSOR_GAS_BUDGET: 50_000_000,
      },
    }));
    const mod = await import("../chain-sponsor");
    await expect(
      mod.buildSponsoredTransactionFromKind({ sender: "bad", kindBytes: "base64kind" })
    ).rejects.toThrow("Invalid sender address");
  });

  it("uses fallback RPC URL from network when no explicit URL", async () => {
    vi.resetModules();
    const localMockBuild = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const localMockSetSender = vi.fn();
    const localMockSetGasOwner = vi.fn();
    const localMockSetGasBudget = vi.fn();
    const localMockGetData = vi.fn().mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
    });
    const localTxObj = () => ({
      setSender: localMockSetSender,
      setGasOwner: localMockSetGasOwner,
      setGasBudget: localMockSetGasBudget,
      getData: localMockGetData,
      build: localMockBuild,
    });
    vi.doMock("@mysten/sui/transactions", () => ({
      Transaction: { fromKind: vi.fn(localTxObj), from: vi.fn(localTxObj) },
    }));
    vi.doMock("@mysten/sui/client", () => ({
      SuiClient: function MockSuiClient() {
        return { executeTransactionBlock: vi.fn() };
      },
      getFullnodeUrl: vi.fn(() => "https://fullnode.testnet.sui.io"),
    }));
    vi.doMock("@mysten/sui/keypairs/ed25519", () => ({
      Ed25519Keypair: {
        fromSecretKey: vi.fn(() => ({
          toSuiAddress: vi.fn(() => "0x" + "sp".repeat(32)),
          signTransaction: vi.fn().mockResolvedValue({ signature: "sig" }),
        })),
      },
    }));
    vi.doMock("@mysten/sui/utils", () => ({
      fromBase64: vi.fn(() => new Uint8Array([1, 2, 3])),
      toBase64: vi.fn(() => "base64bytes"),
      normalizeSuiAddress: (addr: string) => {
        if (!addr) return "0x" + "0".repeat(64);
        if (addr.startsWith("0x") && addr.length === 66) return addr.toLowerCase();
        return "0x" + addr.replace(/^0x/, "").padStart(64, "0").toLowerCase();
      },
      isValidSuiAddress: (addr: string) =>
        typeof addr === "string" && addr.startsWith("0x") && addr.length === 66,
    }));
    vi.doMock("contracts/deployment", () => ({
      PACKAGE_ID: "0x" + "ab".repeat(32),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        SUI_RPC_URL: "",
        NEXT_PUBLIC_SUI_RPC_URL: "",
        SUI_NETWORK: "testnet",
        SUI_SPONSOR_PRIVATE_KEY: "test-sponsor-key",
        SUI_ADMIN_PRIVATE_KEY: "test-admin-key",
        SUI_SPONSOR_GAS_BUDGET: 50_000_000,
      },
    }));
    const mod = await import("../chain-sponsor");
    const result = await mod.buildSponsoredTransactionFromKind({
      sender: VALID_SENDER,
      kindBytes: "base64kind",
    });
    expect(result.bytes).toBe("base64bytes");
  });

  it("throws when sponsor key is missing", async () => {
    vi.resetModules();
    const localMockGetData = vi.fn().mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
    });
    const localTxObj = () => ({
      setSender: vi.fn(),
      setGasOwner: vi.fn(),
      setGasBudget: vi.fn(),
      getData: localMockGetData,
      build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    });
    vi.doMock("@mysten/sui/transactions", () => ({
      Transaction: { fromKind: vi.fn(localTxObj), from: vi.fn(localTxObj) },
    }));
    vi.doMock("@mysten/sui/client", () => ({
      SuiClient: vi.fn(() => ({})),
      getFullnodeUrl: vi.fn(() => "https://fullnode.testnet.sui.io"),
    }));
    vi.doMock("@mysten/sui/keypairs/ed25519", () => ({
      Ed25519Keypair: { fromSecretKey: vi.fn() },
    }));
    vi.doMock("@mysten/sui/utils", () => ({
      fromBase64: vi.fn(() => new Uint8Array([1, 2, 3])),
      toBase64: vi.fn(() => "base64bytes"),
      normalizeSuiAddress: (addr: string) => {
        if (!addr) return "0x" + "0".repeat(64);
        if (addr.startsWith("0x") && addr.length === 66) return addr.toLowerCase();
        return "0x" + addr.replace(/^0x/, "").padStart(64, "0").toLowerCase();
      },
      isValidSuiAddress: (addr: string) =>
        typeof addr === "string" && addr.startsWith("0x") && addr.length === 66,
    }));
    vi.doMock("contracts/deployment", () => ({
      PACKAGE_ID: "0x" + "ab".repeat(32),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        SUI_RPC_URL: "https://test-rpc.example.com",
        NEXT_PUBLIC_SUI_RPC_URL: "",
        SUI_NETWORK: "testnet",
        SUI_SPONSOR_PRIVATE_KEY: "",
        SUI_ADMIN_PRIVATE_KEY: "",
        SUI_SPONSOR_GAS_BUDGET: 50_000_000,
      },
    }));
    const mod = await import("../chain-sponsor");
    await expect(
      mod.buildSponsoredTransactionFromKind({ sender: VALID_SENDER, kindBytes: "base64kind" })
    ).rejects.toThrow("Missing SUI_SPONSOR_PRIVATE_KEY");
  });

  it("throws for invalid gas budget (negative)", async () => {
    vi.resetModules();
    const localMockGetData = vi.fn().mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
    });
    const localTxObj = () => ({
      setSender: vi.fn(),
      setGasOwner: vi.fn(),
      setGasBudget: vi.fn(),
      getData: localMockGetData,
      build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    });
    vi.doMock("@mysten/sui/transactions", () => ({
      Transaction: { fromKind: vi.fn(localTxObj), from: vi.fn(localTxObj) },
    }));
    vi.doMock("@mysten/sui/client", () => ({
      SuiClient: function MockSuiClient() {
        return {};
      },
      getFullnodeUrl: vi.fn(() => "https://fullnode.testnet.sui.io"),
    }));
    vi.doMock("@mysten/sui/keypairs/ed25519", () => ({
      Ed25519Keypair: {
        fromSecretKey: vi.fn(() => ({
          toSuiAddress: vi.fn(() => "0x" + "sp".repeat(32)),
          signTransaction: vi.fn().mockResolvedValue({ signature: "sig" }),
        })),
      },
    }));
    vi.doMock("@mysten/sui/utils", () => ({
      fromBase64: vi.fn(() => new Uint8Array([1, 2, 3])),
      toBase64: vi.fn(() => "base64bytes"),
      normalizeSuiAddress: (addr: string) => {
        if (!addr) return "0x" + "0".repeat(64);
        if (addr.startsWith("0x") && addr.length === 66) return addr.toLowerCase();
        return "0x" + addr.replace(/^0x/, "").padStart(64, "0").toLowerCase();
      },
      isValidSuiAddress: (addr: string) =>
        typeof addr === "string" && addr.startsWith("0x") && addr.length === 66,
    }));
    vi.doMock("contracts/deployment", () => ({
      PACKAGE_ID: "0x" + "ab".repeat(32),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        SUI_RPC_URL: "https://test-rpc.example.com",
        NEXT_PUBLIC_SUI_RPC_URL: "",
        SUI_NETWORK: "testnet",
        SUI_SPONSOR_PRIVATE_KEY: "test-sponsor-key",
        SUI_ADMIN_PRIVATE_KEY: "test-admin-key",
        SUI_SPONSOR_GAS_BUDGET: -1,
      },
    }));
    const mod = await import("../chain-sponsor");
    await expect(
      mod.buildSponsoredTransactionFromKind({ sender: VALID_SENDER, kindBytes: "base64kind" })
    ).rejects.toThrow("Invalid SUI_SPONSOR_GAS_BUDGET");
  });
});

// ── executeSponsoredTransaction ──

describe("executeSponsoredTransaction", () => {
  it("executes a sponsored transaction successfully", async () => {
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
      gasData: { owner: "0x" + "sp".repeat(32), budget: "50000000" },
    });
    mockExecuteTransactionBlock.mockResolvedValue({
      digest: "exec-digest",
      effects: { status: { status: "success" } },
    });

    const result = await executeSponsoredTransaction({
      txBytes: "base64tx",
      userSignature: "user-sig",
    });
    expect(result.digest).toBe("exec-digest");
  });

  it("throws when gas owner mismatches", async () => {
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
      gasData: { owner: "0x" + "ff".repeat(32), budget: "50000000" },
    });

    await expect(
      executeSponsoredTransaction({ txBytes: "base64tx", userSignature: "user-sig" })
    ).rejects.toThrow("Gas owner mismatch");
  });

  it("throws when gas budget exceeds limit", async () => {
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
      gasData: { owner: "0x" + "sp".repeat(32), budget: "999999999999" },
    });

    await expect(
      executeSponsoredTransaction({ txBytes: "base64tx", userSignature: "user-sig" })
    ).rejects.toThrow("Gas budget exceeds sponsor limit");
  });

  it("throws when chain transaction fails", async () => {
    mockGetData.mockReturnValue({
      commands: [
        {
          $kind: "MoveCall",
          MoveCall: {
            package: NORMALIZED_PKG,
            module: "order_system",
            function: "create_order",
          },
        },
      ],
      sender: VALID_SENDER,
      gasData: { owner: "0x" + "sp".repeat(32), budget: "50000000" },
    });
    mockExecuteTransactionBlock.mockResolvedValue({
      digest: "fail-digest",
      effects: { status: { status: "failure", error: "out of gas" } },
    });

    await expect(
      executeSponsoredTransaction({ txBytes: "base64tx", userSignature: "user-sig" })
    ).rejects.toThrow("out of gas");
  });
});
