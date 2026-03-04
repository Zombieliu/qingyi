import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  parseBody: vi.fn(),
  queryRedeemCodes: vi.fn(),
  normalizeRedeemCode: vi.fn(),
  createRedeemBatch: vi.fn(),
  createRedeemCodes: vi.fn(),
  recordAudit: vi.fn(),
  findExistingRedeemCodesEdgeRead: vi.fn(),
}));

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));
vi.mock("@/lib/admin/redeem-store", () => ({
  queryRedeemCodes: mocks.queryRedeemCodes,
  normalizeRedeemCode: mocks.normalizeRedeemCode,
  createRedeemBatch: mocks.createRedeemBatch,
  createRedeemCodes: mocks.createRedeemCodes,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/edge-db/redeem-write-store", () => ({
  findExistingRedeemCodesEdgeRead: mocks.findExistingRedeemCodesEdgeRead,
}));

import { GET, POST } from "../route";

describe("/api/admin/redeem/codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "ops", authType: "session" });
    mocks.normalizeRedeemCode.mockImplementation((code: string) => code.trim().toUpperCase());
    mocks.findExistingRedeemCodesEdgeRead.mockResolvedValue([]);
    mocks.createRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mocks.createRedeemCodes.mockResolvedValue([{ id: "RCD-1", code: "ABCDE1" }]);
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("GET returns query result", async () => {
    mocks.queryRedeemCodes.mockResolvedValue({
      items: [{ id: "x" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const res = await GET(
      new Request("http://localhost/api/admin/redeem/codes?page=1&pageSize=20")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: "x" }], total: 1, page: 1, pageSize: 20 });
  });

  it("POST rejects invalid reward payload", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        title: "test",
        rewardType: "mantou",
        rewardPayload: {},
        status: "active",
      },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/redeem/codes", { method: "POST" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "reward amount required" });
  });

  it("POST returns duplicate_codes when conflicts exist", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        title: "test",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        status: "active",
        codes: ["abcde1"],
      },
    });
    mocks.findExistingRedeemCodesEdgeRead.mockResolvedValue(["ABCDE1"]);

    const res = await POST(
      new Request("http://localhost/api/admin/redeem/codes", { method: "POST" })
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "duplicate_codes", duplicated: ["ABCDE1"] });
  });

  it("POST creates batch and codes", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        title: "Batch A",
        description: "desc",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        status: "active",
        codes: ["abcde1", "abcde2"],
      },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/redeem/codes", { method: "POST" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batch).toEqual({ id: "RBT-1" });
    expect(body.count).toBe(2);
    expect(mocks.findExistingRedeemCodesEdgeRead).toHaveBeenCalledWith(["ABCDE1", "ABCDE2"]);
    expect(mocks.createRedeemCodes).toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalled();
  });
});
