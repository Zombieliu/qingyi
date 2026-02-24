import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  addMembershipRequest: vi.fn(),
  getMembershipTierById: vi.fn(),
  listActiveMembershipTiers: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map();
    }
    async json() {
      return this.body;
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/admin/admin-store", () => ({
  addMembershipRequest: mocks.addMembershipRequest,
  getMembershipTierById: mocks.getMembershipTierById,
  listActiveMembershipTiers: mocks.listActiveMembershipTiers,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("POST /api/vip/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = new Request("http://localhost/api/vip/request", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: "bad" },
      rawBody: "{}",
    });
    const req = new Request("http://localhost/api/vip/request", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request("http://localhost/api/vip/request", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no active tier", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getMembershipTierById.mockResolvedValue(null);
    mocks.listActiveMembershipTiers.mockResolvedValue([]);
    const req = new Request("http://localhost/api/vip/request", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no active tier");
  });

  it("creates VIP request successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, userName: "Test" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.listActiveMembershipTiers.mockResolvedValue([{ id: "T-1", name: "Gold" }]);
    mocks.addMembershipRequest.mockResolvedValue(undefined);
    const req = new Request("http://localhost/api/vip/request", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("待审核");
  });

  it("uses specified tierId when provided", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, tierId: "T-2" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getMembershipTierById.mockResolvedValue({ id: "T-2", name: "Platinum" });
    mocks.addMembershipRequest.mockResolvedValue(undefined);
    const req = new Request("http://localhost/api/vip/request", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.addMembershipRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tierId: "T-2", tierName: "Platinum" })
    );
  });
});
