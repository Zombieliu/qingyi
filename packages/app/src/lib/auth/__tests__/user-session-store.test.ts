import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  userSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import {
  createUserSession,
  getUserSessionByHash,
  updateUserSessionByHash,
  removeUserSessionByHash,
  type UserSessionRecord,
} from "../user-session-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const NOW = 1700000000000;
const LATER = 1700086400000;

const sampleInput: UserSessionRecord = {
  id: "sess-1",
  tokenHash: "hash123",
  address: "0xabc",
  createdAt: NOW,
  expiresAt: LATER,
  lastSeenAt: NOW,
  ip: "127.0.0.1",
  userAgent: "TestAgent/1.0",
};

const sampleRow = {
  id: "sess-1",
  tokenHash: "hash123",
  address: "0xabc",
  createdAt: new Date(NOW),
  expiresAt: new Date(LATER),
  lastSeenAt: new Date(NOW),
  ip: "127.0.0.1",
  userAgent: "TestAgent/1.0",
};

describe("createUserSession", () => {
  it("creates with correct data", async () => {
    mockPrisma.userSession.create.mockResolvedValue(sampleRow);

    await createUserSession(sampleInput);

    expect(mockPrisma.userSession.create).toHaveBeenCalledWith({
      data: {
        id: "sess-1",
        tokenHash: "hash123",
        address: "0xabc",
        createdAt: new Date(NOW),
        expiresAt: new Date(LATER),
        lastSeenAt: new Date(NOW),
        ip: "127.0.0.1",
        userAgent: "TestAgent/1.0",
      },
    });
  });

  it("converts timestamps to Date objects", async () => {
    mockPrisma.userSession.create.mockResolvedValue(sampleRow);

    await createUserSession(sampleInput);

    const callData = mockPrisma.userSession.create.mock.calls[0][0].data;
    expect(callData.createdAt).toBeInstanceOf(Date);
    expect(callData.expiresAt).toBeInstanceOf(Date);
    expect(callData.lastSeenAt).toBeInstanceOf(Date);
  });

  it("returns mapped record with numeric timestamps", async () => {
    mockPrisma.userSession.create.mockResolvedValue(sampleRow);

    const result = await createUserSession(sampleInput);

    expect(result).toEqual({
      id: "sess-1",
      tokenHash: "hash123",
      address: "0xabc",
      createdAt: NOW,
      expiresAt: LATER,
      lastSeenAt: NOW,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });
  });

  it("handles null lastSeenAt", async () => {
    const inputNoLastSeen = { ...sampleInput, lastSeenAt: null };
    const rowNoLastSeen = { ...sampleRow, lastSeenAt: null };
    mockPrisma.userSession.create.mockResolvedValue(rowNoLastSeen);

    const result = await createUserSession(inputNoLastSeen);

    expect(result.lastSeenAt).toBeNull();
    const callData = mockPrisma.userSession.create.mock.calls[0][0].data;
    expect(callData.lastSeenAt).toBeNull();
  });

  it("handles null ip and userAgent in create", async () => {
    const inputNoIpUa = { ...sampleInput, ip: null, userAgent: null };
    const rowNoIpUa = { ...sampleRow, ip: null, userAgent: null };
    mockPrisma.userSession.create.mockResolvedValue(rowNoIpUa);

    const result = await createUserSession(inputNoIpUa);

    expect(result.ip).toBeNull();
    expect(result.userAgent).toBeNull();
  });

  it("handles undefined ip and userAgent in create", async () => {
    const inputNoIpUa = {
      ...sampleInput,
      ip: undefined,
      userAgent: undefined,
    } as unknown as UserSessionRecord;
    const rowNoIpUa = { ...sampleRow, ip: null, userAgent: null };
    mockPrisma.userSession.create.mockResolvedValue(rowNoIpUa);

    const result = await createUserSession(inputNoIpUa);

    expect(result.ip).toBeNull();
    expect(result.userAgent).toBeNull();
  });
});

describe("getUserSessionByHash", () => {
  it("returns null when not found", async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(null);

    const result = await getUserSessionByHash("nonexistent");

    expect(result).toBeNull();
    expect(mockPrisma.userSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: "nonexistent" },
    });
  });

  it("returns mapped record", async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(sampleRow);

    const result = await getUserSessionByHash("hash123");

    expect(result).toEqual({
      id: "sess-1",
      tokenHash: "hash123",
      address: "0xabc",
      createdAt: NOW,
      expiresAt: LATER,
      lastSeenAt: NOW,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });
  });

  it("converts Date to timestamp", async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(sampleRow);

    const result = await getUserSessionByHash("hash123");

    expect(typeof result!.createdAt).toBe("number");
    expect(typeof result!.expiresAt).toBe("number");
    expect(result!.createdAt).toBe(sampleRow.createdAt.getTime());
  });
});

describe("updateUserSessionByHash", () => {
  it("updates fields", async () => {
    const updatedRow = { ...sampleRow, expiresAt: new Date(LATER + 1000) };
    mockPrisma.userSession.update.mockResolvedValue(updatedRow);

    const result = await updateUserSessionByHash("hash123", {
      expiresAt: LATER + 1000,
    });

    expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
      where: { tokenHash: "hash123" },
      data: {
        expiresAt: new Date(LATER + 1000),
        lastSeenAt: undefined,
        ip: undefined,
        userAgent: undefined,
      },
    });
    expect(result.expiresAt).toBe(LATER + 1000);
  });

  it("handles partial updates", async () => {
    const updatedRow = { ...sampleRow, ip: "10.0.0.1" };
    mockPrisma.userSession.update.mockResolvedValue(updatedRow);

    const result = await updateUserSessionByHash("hash123", {
      ip: "10.0.0.1",
    });

    const callData = mockPrisma.userSession.update.mock.calls[0][0].data;
    expect(callData.expiresAt).toBeUndefined();
    expect(callData.ip).toBe("10.0.0.1");
    expect(result.ip).toBe("10.0.0.1");
  });

  it("updates lastSeenAt with a number", async () => {
    const updatedRow = { ...sampleRow, lastSeenAt: new Date(LATER) };
    mockPrisma.userSession.update.mockResolvedValue(updatedRow);

    const result = await updateUserSessionByHash("hash123", {
      lastSeenAt: LATER,
    });

    const callData = mockPrisma.userSession.update.mock.calls[0][0].data;
    expect(callData.lastSeenAt).toEqual(new Date(LATER));
    expect(result.lastSeenAt).toBe(LATER);
  });

  it("updates lastSeenAt with null", async () => {
    const updatedRow = { ...sampleRow, lastSeenAt: null };
    mockPrisma.userSession.update.mockResolvedValue(updatedRow);

    const result = await updateUserSessionByHash("hash123", {
      lastSeenAt: null,
    });

    const callData = mockPrisma.userSession.update.mock.calls[0][0].data;
    expect(callData.lastSeenAt).toBeNull();
    expect(result.lastSeenAt).toBeNull();
  });

  it("updates lastSeenAt with 0 (falsy)", async () => {
    const updatedRow = { ...sampleRow, lastSeenAt: null };
    mockPrisma.userSession.update.mockResolvedValue(updatedRow);

    const result = await updateUserSessionByHash("hash123", {
      lastSeenAt: 0,
    });

    const callData = mockPrisma.userSession.update.mock.calls[0][0].data;
    // toDate(0) returns null since 0 is falsy
    expect(callData.lastSeenAt).toBeNull();
  });

  it("updates userAgent", async () => {
    const updatedRow = { ...sampleRow, userAgent: "NewAgent/2.0" };
    mockPrisma.userSession.update.mockResolvedValue(updatedRow);

    const result = await updateUserSessionByHash("hash123", {
      userAgent: "NewAgent/2.0",
    });

    expect(result.userAgent).toBe("NewAgent/2.0");
  });
});

describe("removeUserSessionByHash", () => {
  it("returns true on success", async () => {
    mockPrisma.userSession.delete.mockResolvedValue(sampleRow);

    const result = await removeUserSessionByHash("hash123");

    expect(result).toBe(true);
    expect(mockPrisma.userSession.delete).toHaveBeenCalledWith({
      where: { tokenHash: "hash123" },
    });
  });

  it("returns false on error", async () => {
    mockPrisma.userSession.delete.mockRejectedValue(new Error("not found"));

    const result = await removeUserSessionByHash("nonexistent");

    expect(result).toBe(false);
  });
});
