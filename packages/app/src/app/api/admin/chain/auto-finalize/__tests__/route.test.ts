import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockAutoFinalizeChainOrdersSummary, mockRecordAudit } = vi.hoisted(
  () => ({
    mockRequireAdmin: vi.fn(),
    mockAutoFinalizeChainOrdersSummary: vi.fn(),
    mockRecordAudit: vi.fn(),
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-auto-finalize", () => ({
  autoFinalizeChainOrdersSummary: mockAutoFinalizeChainOrdersSummary,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { POST } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown = {}) {
  return new Request("http://localhost/api/admin/chain/auto-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/chain/auto-finalize", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it("runs auto finalize and returns result", async () => {
    const result = {
      complete: { enabled: true, hours: 48, completed: 1, candidates: 3 },
      finalize: { enabled: true, finalized: 2, candidates: 4 },
    };
    mockAutoFinalizeChainOrdersSummary.mockResolvedValue(result);
    const res = await POST(makePost());
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.complete.completed).toBe(1);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    mockAutoFinalizeChainOrdersSummary.mockRejectedValue(new Error("fail"));
    const res = await POST(makePost());
    expect(res.status).toBe(500);
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/chain/auto-finalize", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("passes completeLimit and finalizeLimit options", async () => {
    const result = {
      complete: { enabled: true, hours: 48, completed: 0, candidates: 0 },
      finalize: { enabled: true, finalized: 0, candidates: 0 },
    };
    mockAutoFinalizeChainOrdersSummary.mockResolvedValue(result);
    await POST(makePost({ dryRun: true, completeLimit: 5, finalizeLimit: 10 }));
    expect(mockAutoFinalizeChainOrdersSummary).toHaveBeenCalledWith({
      dryRun: true,
      completeLimit: 5,
      finalizeLimit: 10,
    });
  });

  it("handles error without message", async () => {
    mockAutoFinalizeChainOrdersSummary.mockRejectedValue({});
    const res = await POST(makePost());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("auto finalize failed");
  });
});
