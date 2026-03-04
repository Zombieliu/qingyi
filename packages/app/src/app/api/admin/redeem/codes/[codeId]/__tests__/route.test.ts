import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  updateRedeemCodeByIdEdgeWrite: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/edge-db/redeem-write-store", () => ({
  updateRedeemCodeByIdEdgeWrite: mocks.updateRedeemCodeByIdEdgeWrite,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mocks.recordAudit }));

import { PATCH } from "../route";

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/redeem/codes/code-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/redeem/codes/[codeId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "ops", authType: "session" });
    mocks.updateRedeemCodeByIdEdgeWrite.mockResolvedValue(undefined);
  });

  it("returns 401 when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(makePatch({ status: "disabled" }), {
      params: Promise.resolve({ codeId: "code-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when codeId is missing", async () => {
    const res = await PATCH(makePatch({ status: "disabled" }), {
      params: Promise.resolve({ codeId: "" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "codeId required" });
  });

  it("updates redeem code and records audit", async () => {
    const res = await PATCH(makePatch({ status: "disabled", startsAt: 1_700_000_000_000 }), {
      params: Promise.resolve({ codeId: "code-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.updateRedeemCodeByIdEdgeWrite).toHaveBeenCalledWith(
      expect.objectContaining({ codeId: "code-1", status: "disabled" })
    );
    expect(mocks.recordAudit).toHaveBeenCalled();
  });

  it("normalizes startsAt and expiresAt before patching", async () => {
    const res = await PATCH(makePatch({ startsAt: "1700000000000", expiresAt: "not-a-date" }), {
      params: Promise.resolve({ codeId: "code-1" }),
    });

    expect(res.status).toBe(200);
    const args = mocks.updateRedeemCodeByIdEdgeWrite.mock.calls[0]?.[0] as {
      startsAt: Date | null;
      expiresAt: Date | null;
    };
    expect(args.startsAt?.getTime()).toBe(1_700_000_000_000);
    expect(args.expiresAt).toBeNull();
  });

  it("returns 400 for invalid body", async () => {
    const res = await PATCH(makePatch({ status: "not-valid" }), {
      params: Promise.resolve({ codeId: "code-1" }),
    });
    expect(res.status).toBe(400);
  });
});
