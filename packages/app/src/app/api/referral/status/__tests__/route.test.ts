import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getReferralByInviteeEdgeRead: vi.fn(),
  queryReferralsByInviterEdgeRead: vi.fn(),
  requireUserAuth: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
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

vi.mock("@/lib/edge-db/user-read-store", () => ({
  getReferralByInviteeEdgeRead: mocks.getReferralByInviteeEdgeRead,
  queryReferralsByInviterEdgeRead: mocks.queryReferralsByInviterEdgeRead,
}));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function createMockRequest(url: string) {
  return new Request(url);
}

describe("GET /api/referral/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });

  it("returns 400 for missing address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    const req = createMockRequest("http://localhost/api/referral/status");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid address");
  });

  it("returns 400 for invalid address", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = createMockRequest("http://localhost/api/referral/status?address=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest(`http://localhost/api/referral/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns referral status with invites", async () => {
    mocks.getReferralByInviteeEdgeRead.mockResolvedValue({
      inviterAddress: "0x" + "b".repeat(64),
      status: "rewarded",
      rewardInvitee: 10,
    });
    mocks.queryReferralsByInviterEdgeRead.mockResolvedValue([
      {
        inviteeAddress: "0x" + "c".repeat(64),
        status: "rewarded",
        rewardInviter: 20,
        createdAt: 1000,
        rewardedAt: 2000,
      },
    ]);
    const req = createMockRequest(`http://localhost/api/referral/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.refCode).toBe(VALID_ADDRESS.slice(-8));
    expect(body.invitedBy).toBeTruthy();
    expect(body.inviteCount).toBe(1);
    expect(body.rewardedCount).toBe(1);
    expect(body.totalReward).toBe(20);
  });

  it("returns null invitedBy when not invited", async () => {
    mocks.getReferralByInviteeEdgeRead.mockResolvedValue(null);
    mocks.queryReferralsByInviterEdgeRead.mockResolvedValue([]);
    const req = createMockRequest(`http://localhost/api/referral/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitedBy).toBeNull();
    expect(body.inviteCount).toBe(0);
    expect(body.totalReward).toBe(0);
  });
});
