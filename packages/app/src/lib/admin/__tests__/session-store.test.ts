import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSessionCreate = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockSessionUpdate = vi.fn();
const mockSessionDelete = vi.fn();
const mockTokenFindMany = vi.fn();
const mockTokenFindUnique = vi.fn();
const mockTokenCreate = vi.fn();
const mockTokenUpdate = vi.fn();
const mockTokenDelete = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    adminSession: {
      create: (...args: unknown[]) => mockSessionCreate(...args),
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
      update: (...args: unknown[]) => mockSessionUpdate(...args),
      delete: (...args: unknown[]) => mockSessionDelete(...args),
    },
    adminAccessToken: {
      findMany: (...args: unknown[]) => mockTokenFindMany(...args),
      findUnique: (...args: unknown[]) => mockTokenFindUnique(...args),
      create: (...args: unknown[]) => mockTokenCreate(...args),
      update: (...args: unknown[]) => mockTokenUpdate(...args),
      delete: (...args: unknown[]) => mockTokenDelete(...args),
    },
  },
}));

import {
  createSession,
  getSessionByHash,
  updateSessionByHash,
  removeSessionByHash,
  listAccessTokens,
  getAccessTokenByHash,
  addAccessToken,
  updateAccessToken,
  touchAccessTokenByHash,
  removeAccessToken,
} from "../session-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date("2026-01-15T10:00:00Z");
const expires = new Date("2026-01-16T10:00:00Z");

const baseSessionRow = {
  id: "SES-1",
  tokenHash: "hash123",
  role: "admin",
  label: "main",
  createdAt: now,
  expiresAt: expires,
  lastSeenAt: null,
  ip: "127.0.0.1",
  userAgent: "Mozilla/5.0",
};

const baseTokenRow = {
  id: "TOK-1",
  tokenHash: "tokenhash123",
  tokenPrefix: "qy_",
  role: "admin",
  label: "API Token",
  status: "active",
  createdAt: now,
  updatedAt: null,
  lastUsedAt: null,
};

// ---- Sessions ----

describe("createSession", () => {
  it("creates a session", async () => {
    mockSessionCreate.mockResolvedValue(baseSessionRow);

    const result = await createSession({
      id: "SES-1",
      tokenHash: "hash123",
      role: "admin",
      label: "main",
      createdAt: now.getTime(),
      expiresAt: expires.getTime(),
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
    });

    expect(result.id).toBe("SES-1");
    expect(result.tokenHash).toBe("hash123");
    expect(result.role).toBe("admin");
    expect(result.createdAt).toBe(now.getTime());
    expect(result.expiresAt).toBe(expires.getTime());
  });

  it("handles session with no optional fields", async () => {
    const minimalRow = {
      ...baseSessionRow,
      label: null,
      lastSeenAt: null,
      ip: null,
      userAgent: null,
    };
    mockSessionCreate.mockResolvedValue(minimalRow);

    const result = await createSession({
      id: "SES-2",
      tokenHash: "hash456",
      role: "ops",
      createdAt: now.getTime(),
      expiresAt: expires.getTime(),
    });

    expect(result.label).toBeUndefined();
    expect(result.lastSeenAt).toBeUndefined();
    expect(result.ip).toBeUndefined();
    expect(result.userAgent).toBeUndefined();
  });

  it("maps lastSeenAt when present", async () => {
    const rowWithLastSeen = { ...baseSessionRow, lastSeenAt: now };
    mockSessionCreate.mockResolvedValue(rowWithLastSeen);

    const result = await createSession({
      id: "SES-3",
      tokenHash: "hash789",
      role: "admin",
      createdAt: now.getTime(),
      expiresAt: expires.getTime(),
      lastSeenAt: now.getTime(),
    });

    expect(result.lastSeenAt).toBe(now.getTime());
  });
});

describe("getSessionByHash", () => {
  it("returns session when found", async () => {
    mockSessionFindUnique.mockResolvedValue(baseSessionRow);

    const result = await getSessionByHash("hash123");
    expect(result).not.toBeNull();
    expect(result!.tokenHash).toBe("hash123");
  });

  it("returns null when not found", async () => {
    mockSessionFindUnique.mockResolvedValue(null);

    const result = await getSessionByHash("nonexistent");
    expect(result).toBeNull();
  });
});

describe("updateSessionByHash", () => {
  it("updates session and returns result", async () => {
    mockSessionUpdate.mockResolvedValue({ ...baseSessionRow, role: "ops" });

    const result = await updateSessionByHash("hash123", { role: "ops" });
    expect(result).not.toBeNull();
    expect(result!.role).toBe("ops");
  });

  it("returns null on error", async () => {
    mockSessionUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateSessionByHash("nonexistent", { role: "ops" });
    expect(result).toBeNull();
  });

  it("updates with lastSeenAt", async () => {
    const updatedRow = { ...baseSessionRow, lastSeenAt: now };
    mockSessionUpdate.mockResolvedValue(updatedRow);

    const result = await updateSessionByHash("hash123", { lastSeenAt: now.getTime() });
    expect(result).not.toBeNull();
    expect(result!.lastSeenAt).toBe(now.getTime());
  });

  it("updates with expiresAt", async () => {
    const newExpires = new Date("2026-01-17T10:00:00Z");
    const updatedRow = { ...baseSessionRow, expiresAt: newExpires };
    mockSessionUpdate.mockResolvedValue(updatedRow);

    const result = await updateSessionByHash("hash123", { expiresAt: newExpires.getTime() });
    expect(result).not.toBeNull();
    expect(result!.expiresAt).toBe(newExpires.getTime());
  });

  it("updates with label, ip, userAgent", async () => {
    const updatedRow = {
      ...baseSessionRow,
      label: "new-label",
      ip: "10.0.0.1",
      userAgent: "Chrome",
    };
    mockSessionUpdate.mockResolvedValue(updatedRow);

    const result = await updateSessionByHash("hash123", {
      label: "new-label",
      ip: "10.0.0.1",
      userAgent: "Chrome",
    });
    expect(result).not.toBeNull();
    expect(result!.label).toBe("new-label");
    expect(result!.ip).toBe("10.0.0.1");
    expect(result!.userAgent).toBe("Chrome");
  });
});

describe("removeSessionByHash", () => {
  it("returns true on success", async () => {
    mockSessionDelete.mockResolvedValue(baseSessionRow);
    expect(await removeSessionByHash("hash123")).toBe(true);
  });

  it("returns false on error", async () => {
    mockSessionDelete.mockRejectedValue(new Error("not found"));
    expect(await removeSessionByHash("nonexistent")).toBe(false);
  });
});

// ---- Access Tokens ----

describe("listAccessTokens", () => {
  it("returns list of tokens", async () => {
    mockTokenFindMany.mockResolvedValue([baseTokenRow]);

    const result = await listAccessTokens();
    expect(result).toHaveLength(1);
    expect(result[0].tokenPrefix).toBe("qy_");
  });
});

describe("getAccessTokenByHash", () => {
  it("returns token when found", async () => {
    mockTokenFindUnique.mockResolvedValue(baseTokenRow);

    const result = await getAccessTokenByHash("tokenhash123");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("TOK-1");
  });

  it("returns null when not found", async () => {
    mockTokenFindUnique.mockResolvedValue(null);

    const result = await getAccessTokenByHash("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null on error", async () => {
    mockTokenFindUnique.mockRejectedValue(new Error("db error"));

    const result = await getAccessTokenByHash("bad");
    expect(result).toBeNull();
  });
});

describe("addAccessToken", () => {
  it("creates a new access token", async () => {
    mockTokenCreate.mockResolvedValue(baseTokenRow);

    const result = await addAccessToken({
      id: "TOK-1",
      tokenHash: "tokenhash123",
      tokenPrefix: "qy_",
      role: "admin",
      label: "API Token",
      status: "active",
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("TOK-1");
    expect(result.status).toBe("active");
  });

  it("creates token with updatedAt and lastUsedAt", async () => {
    mockTokenCreate.mockResolvedValue({
      ...baseTokenRow,
      updatedAt: now,
      lastUsedAt: now,
    });

    const result = await addAccessToken({
      id: "TOK-2",
      tokenHash: "tokenhash456",
      tokenPrefix: "qy_",
      role: "ops",
      status: "active",
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      lastUsedAt: now.getTime(),
    });

    expect(result.updatedAt).toBe(now.getTime());
    expect(result.lastUsedAt).toBe(now.getTime());
  });

  it("creates token without optional label", async () => {
    mockTokenCreate.mockResolvedValue({ ...baseTokenRow, label: null });

    const result = await addAccessToken({
      id: "TOK-3",
      tokenHash: "tokenhash789",
      tokenPrefix: "qy_",
      role: "admin",
      status: "active",
      createdAt: now.getTime(),
    });

    expect(result.label).toBeUndefined();
  });
});

describe("updateAccessToken", () => {
  it("updates token and returns result", async () => {
    mockTokenUpdate.mockResolvedValue({ ...baseTokenRow, status: "disabled" });

    const result = await updateAccessToken("TOK-1", { status: "disabled" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("disabled");
  });

  it("returns null on error", async () => {
    mockTokenUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateAccessToken("TOK-999", { status: "disabled" });
    expect(result).toBeNull();
  });

  it("sets label to null when empty string", async () => {
    mockTokenUpdate.mockResolvedValue({ ...baseTokenRow, label: null });

    const result = await updateAccessToken("TOK-1", { label: "" });
    expect(result).not.toBeNull();
    expect(result!.label).toBeUndefined();
  });

  it("updates lastUsedAt", async () => {
    const usedAt = now.getTime();
    mockTokenUpdate.mockResolvedValue({ ...baseTokenRow, lastUsedAt: now });

    const result = await updateAccessToken("TOK-1", { lastUsedAt: usedAt });
    expect(result).not.toBeNull();
    expect(result!.lastUsedAt).toBe(usedAt);
  });

  it("maps updatedAt and lastUsedAt when present", async () => {
    mockTokenUpdate.mockResolvedValue({
      ...baseTokenRow,
      updatedAt: now,
      lastUsedAt: now,
    });

    const result = await updateAccessToken("TOK-1", { role: "ops" });
    expect(result).not.toBeNull();
    expect(result!.updatedAt).toBe(now.getTime());
    expect(result!.lastUsedAt).toBe(now.getTime());
  });
});

describe("touchAccessTokenByHash", () => {
  it("returns true on success", async () => {
    mockTokenUpdate.mockResolvedValue(baseTokenRow);
    expect(await touchAccessTokenByHash("tokenhash123")).toBe(true);
  });

  it("returns false on error", async () => {
    mockTokenUpdate.mockRejectedValue(new Error("not found"));
    expect(await touchAccessTokenByHash("nonexistent")).toBe(false);
  });
});

describe("removeAccessToken", () => {
  it("returns true on success", async () => {
    mockTokenDelete.mockResolvedValue(baseTokenRow);
    expect(await removeAccessToken("TOK-1")).toBe(true);
  });

  it("returns false on error", async () => {
    mockTokenDelete.mockRejectedValue(new Error("not found"));
    expect(await removeAccessToken("TOK-999")).toBe(false);
  });
});
