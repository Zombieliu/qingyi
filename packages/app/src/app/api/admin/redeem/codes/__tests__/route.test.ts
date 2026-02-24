import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockQueryRedeemCodes,
  mockCreateRedeemBatch,
  mockCreateRedeemCodes,
  mockNormalizeRedeemCode,
  mockRecordAudit,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryRedeemCodes: vi.fn(),
  mockCreateRedeemBatch: vi.fn(),
  mockCreateRedeemCodes: vi.fn(),
  mockNormalizeRedeemCode: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockPrisma: { redeemCode: { findMany: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/redeem-store", () => ({
  queryRedeemCodes: mockQueryRedeemCodes,
  createRedeemBatch: mockCreateRedeemBatch,
  createRedeemCodes: mockCreateRedeemCodes,
  normalizeRedeemCode: mockNormalizeRedeemCode,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/redeem/codes");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/redeem/codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockNormalizeRedeemCode.mockImplementation((c: string) => c.toUpperCase());
  mockPrisma.redeemCode.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/redeem/codes", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns redeem codes list", async () => {
    mockQueryRedeemCodes.mockResolvedValue({ items: [], total: 0 });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.items).toEqual([]);
  });
});

describe("POST /api/admin/redeem/codes", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(
      makePost({ title: "Test", rewardType: "mantou", rewardPayload: { amount: 10 } })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makePost({ rewardType: "mantou" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid reward payload", async () => {
    const res = await POST(makePost({ title: "Test", rewardType: "mantou" }));
    expect(res.status).toBe(400);
  });

  it("creates redeem codes successfully", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "ABCDEF" }]);
    const res = await POST(
      makePost({ title: "Test", rewardType: "mantou", rewardPayload: { amount: 10 }, count: 1 })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
    expect(json.codes).toBeTruthy();
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 400 for invalid vip reward payload", async () => {
    const res = await POST(makePost({ title: "Test", rewardType: "vip", rewardPayload: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid coupon reward payload", async () => {
    const res = await POST(makePost({ title: "Test", rewardType: "coupon", rewardPayload: {} }));
    expect(res.status).toBe(400);
  });

  it("creates codes with custom codes array", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "CUSTOM1" }]);
    mockPrisma.redeemCode.findMany.mockResolvedValue([]);
    const res = await POST(
      makePost({
        title: "Test",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        codes: ["CUSTOM1", "CUSTOM2"],
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("returns 409 when duplicate codes exist", async () => {
    mockPrisma.redeemCode.findMany.mockResolvedValue([{ code: "ABCDEF" }]);
    const res = await POST(
      makePost({
        title: "Test",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        codes: ["ABCDEF"],
      })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("duplicate_codes");
  });

  it("retries code generation when duplicates found for auto-generated codes", async () => {
    mockPrisma.redeemCode.findMany
      .mockResolvedValueOnce([{ code: "DUP" }])
      .mockResolvedValueOnce([{ code: "DUP" }])
      .mockResolvedValueOnce([]);
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "NEWCODE" }]);
    const res = await POST(
      makePost({
        title: "Test",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        count: 1,
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("creates codes with vip reward type", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "VIPCODE" }]);
    const res = await POST(
      makePost({
        title: "VIP Test",
        rewardType: "vip",
        rewardPayload: { days: 30 },
        count: 1,
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("creates codes with coupon reward type", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "COUPON1" }]);
    const res = await POST(
      makePost({
        title: "Coupon Test",
        rewardType: "coupon",
        rewardPayload: { couponId: "cp-1" },
        count: 1,
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("creates codes with custom reward type", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "CUSTOM1" }]);
    const res = await POST(
      makePost({
        title: "Custom Test",
        rewardType: "custom",
        rewardPayload: { anything: "value" },
        count: 1,
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("creates codes with startsAt and expiresAt", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "TIMED1" }]);
    const res = await POST(
      makePost({
        title: "Timed Test",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        count: 1,
        startsAt: "2025-01-01",
        expiresAt: 1735689600000,
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("handles parseDate with numeric string startsAt", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "NUM1" }]);
    const res = await POST(
      makePost({
        title: "Numeric Date",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        count: 1,
        startsAt: "1700000000000",
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("handles parseDate with whitespace-only startsAt", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "WS1" }]);
    const res = await POST(
      makePost({
        title: "Whitespace Date",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        count: 1,
        startsAt: "   ",
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("handles parseDate with invalid date string", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "INV1" }]);
    const res = await POST(
      makePost({
        title: "Invalid Date",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        count: 1,
        startsAt: "not-a-date",
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("creates codes with prefix and codeLength", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([{ id: "c1", code: "PREFIXABC" }]);
    const res = await POST(
      makePost({
        title: "Prefix Test",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        count: 1,
        prefix: "PREFIX",
        codeLength: 12,
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });

  it("filters out short codes from custom codes array", async () => {
    mockCreateRedeemBatch.mockResolvedValue({ id: "RBT-1" });
    mockCreateRedeemCodes.mockResolvedValue([]);
    mockPrisma.redeemCode.findMany.mockResolvedValue([]);
    const res = await POST(
      makePost({
        title: "Test",
        rewardType: "mantou",
        rewardPayload: { amount: 10 },
        codes: ["AB", "ABCDEFGH"],
      })
    );
    const json = await res.json();
    expect(json.batch).toBeTruthy();
  });
});
