import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockGetReferralConfig, mockUpdateReferralConfig } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetReferralConfig: vi.fn(),
  mockUpdateReferralConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  getReferralConfig: mockGetReferralConfig,
  updateReferralConfig: mockUpdateReferralConfig,
}));

import { GET, PUT } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePut(body: unknown) {
  return new Request("http://localhost/api/admin/referral/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/referral/config", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/referral/config"));
    expect(res.status).toBe(401);
  });

  it("returns referral config", async () => {
    mockGetReferralConfig.mockResolvedValue({ mode: "fixed", enabled: true });
    const res = await GET(new Request("http://localhost/api/admin/referral/config"));
    const json = await res.json();
    expect(json.mode).toBe("fixed");
  });
});

describe("PUT /api/admin/referral/config", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PUT(makePut({ mode: "percent" }));
    expect(res.status).toBe(401);
  });

  it("returns parseBody error for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/referral/config", {
      method: "PUT",
      body: "not-json",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("updates referral config", async () => {
    mockUpdateReferralConfig.mockResolvedValue({ mode: "percent", enabled: true });
    const res = await PUT(makePut({ mode: "percent" }));
    const json = await res.json();
    expect(json.mode).toBe("percent");
  });

  it("updates all referral config fields", async () => {
    mockUpdateReferralConfig.mockResolvedValue({
      mode: "fixed",
      fixedInviter: 10,
      fixedInvitee: 5,
      percentInviter: 0.1,
      percentInvitee: 0.05,
      enabled: false,
    });
    const res = await PUT(
      makePut({
        mode: "fixed",
        fixedInviter: 10.9,
        fixedInvitee: 5.1,
        percentInviter: 0.1,
        percentInvitee: 0.05,
        enabled: false,
      })
    );
    const json = await res.json();
    expect(json.mode).toBe("fixed");
    expect(json.fixedInviter).toBe(10);
    expect(json.fixedInvitee).toBe(5);
    expect(json.percentInviter).toBe(0.1);
    expect(json.percentInvitee).toBe(0.05);
    expect(json.enabled).toBe(false);
    expect(mockUpdateReferralConfig).toHaveBeenCalledWith({
      mode: "fixed",
      fixedInviter: 10,
      fixedInvitee: 5,
      percentInviter: 0.1,
      percentInvitee: 0.05,
      enabled: false,
    });
  });

  it("updates only partial fields", async () => {
    mockUpdateReferralConfig.mockResolvedValue({ enabled: true });
    const res = await PUT(makePut({ enabled: true }));
    const json = await res.json();
    expect(json.enabled).toBe(true);
    expect(mockUpdateReferralConfig).toHaveBeenCalledWith({ enabled: true });
  });
});
