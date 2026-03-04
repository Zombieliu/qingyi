import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ADDRESS = `0x${"a".repeat(64)}`;

const mocks = vi.hoisted(() => ({
  parseBodyRaw: vi.fn(),
  createUserSession: vi.fn(),
  getUserSessionFromToken: vi.fn(),
  requireUserSignature: vi.fn(),
  getClientIp: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  getMiniProgramAccountByPlatformOpenidEdgeRead: vi.fn(),
  updateMiniProgramAccountByPlatformOpenidEdgeWrite: vi.fn(),
  upsertMiniProgramAccountEdgeWrite: vi.fn(),
}));

vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));
vi.mock("@/lib/auth/user-auth", () => ({
  createUserSession: mocks.createUserSession,
  getUserSessionFromToken: mocks.getUserSessionFromToken,
  requireUserSignature: mocks.requireUserSignature,
}));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/edge-db/mini-auth-store", () => ({
  getMiniProgramAccountByPlatformOpenidEdgeRead:
    mocks.getMiniProgramAccountByPlatformOpenidEdgeRead,
  updateMiniProgramAccountByPlatformOpenidEdgeWrite:
    mocks.updateMiniProgramAccountByPlatformOpenidEdgeWrite,
  upsertMiniProgramAccountEdgeWrite: mocks.upsertMiniProgramAccountEdgeWrite,
}));

import { POST } from "../route";

describe("POST /api/auth/mini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((value: string) => value);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.getMiniProgramAccountByPlatformOpenidEdgeRead.mockResolvedValue(null);
    mocks.getUserSessionFromToken.mockResolvedValue(null);
    mocks.createUserSession.mockResolvedValue({
      token: "tok_test",
      session: { expiresAt: 1_800_000_000_000 },
    });
    mocks.getClientIp.mockReturnValue("127.0.0.1");
  });

  it("returns parseBodyRaw error response", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: false,
      response: Response.json({ error: "invalid" }, { status: 400 }),
    });

    const res = await POST(new Request("http://localhost/api/auth/mini", { method: "POST" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when existing bound account address mismatches", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "code-1", address: VALID_ADDRESS },
      rawBody: "{}",
    });
    mocks.getMiniProgramAccountByPlatformOpenidEdgeRead.mockResolvedValue({
      id: "mp-1",
      platform: "wechat",
      openid: "openid-1",
      unionid: "union-1",
      sessionKey: "sk",
      userAddress: `0x${"b".repeat(64)}`,
      phone: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      lastLoginAt: null,
    });

    const res = await POST(new Request("http://localhost/api/auth/mini", { method: "POST" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "address_mismatch" });
  });

  it("updates existing bound account and returns session", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "code-1", address: VALID_ADDRESS },
      rawBody: "{}",
    });
    mocks.getMiniProgramAccountByPlatformOpenidEdgeRead.mockResolvedValue({
      id: "mp-1",
      platform: "wechat",
      openid: "openid-1",
      unionid: "union-1",
      sessionKey: "sk",
      userAddress: VALID_ADDRESS,
      phone: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      lastLoginAt: null,
    });
    mocks.updateMiniProgramAccountByPlatformOpenidEdgeWrite.mockResolvedValue({
      id: "mp-1",
      platform: "wechat",
      openid: "openid-1",
      unionid: "union-2",
      sessionKey: "sk2",
      userAddress: VALID_ADDRESS,
      phone: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });

    const res = await POST(new Request("http://localhost/api/auth/mini", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.address).toBe(VALID_ADDRESS);
    expect(mocks.updateMiniProgramAccountByPlatformOpenidEdgeWrite).toHaveBeenCalled();
  });

  it("returns binding_required when no address and no bearer session", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "code-1" },
      rawBody: "{}",
    });

    const res = await POST(new Request("http://localhost/api/auth/mini", { method: "POST" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("binding_required");
  });

  it("returns invalid_address when normalized address is invalid", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "code-1", address: "bad" },
      rawBody: "{}",
    });
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);

    const res = await POST(new Request("http://localhost/api/auth/mini", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_address" });
  });

  it("upserts account using bearer session address", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "code-1" },
      rawBody: "{}",
    });
    mocks.getUserSessionFromToken.mockResolvedValue({ address: VALID_ADDRESS });
    mocks.upsertMiniProgramAccountEdgeWrite.mockResolvedValue({
      id: "mp-1",
      platform: "wechat",
      openid: "openid-1",
      unionid: "union-1",
      sessionKey: "sk",
      userAddress: VALID_ADDRESS,
      phone: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost/api/auth/mini", {
        method: "POST",
        headers: { authorization: "Bearer user_token" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.address).toBe(VALID_ADDRESS);
    expect(mocks.upsertMiniProgramAccountEdgeWrite).toHaveBeenCalled();
  });
});
