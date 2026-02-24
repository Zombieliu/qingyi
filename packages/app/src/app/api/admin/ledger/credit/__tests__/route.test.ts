import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockRecordAudit, mockEnv } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockEnv: { LEDGER_ADMIN_TOKEN: "test-token" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { POST } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/ledger/credit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /api/admin/ledger/credit", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ user: "0x1", amount: 100 }));
    expect(res.status).toBe(401);
  });

  it("returns 500 when LEDGER_ADMIN_TOKEN is not configured", async () => {
    mockEnv.LEDGER_ADMIN_TOKEN = "";
    const res = await POST(makePost({ user: "0x1" }));
    expect(res.status).toBe(500);
    mockEnv.LEDGER_ADMIN_TOKEN = "test-token";
  });

  it("returns parseBody error when body is invalid", async () => {
    const req = new Request("http://localhost/api/admin/ledger/credit", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("proxies non-ok response without recording audit", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: "invalid_user" }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const res = await POST(makePost({ user: "0x1", amount: 100 }));
    expect(res.status).toBe(422);
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("handles fetch response with non-JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error("not json")),
    });
    vi.stubGlobal("fetch", mockFetch);
    const res = await POST(makePost({ user: "0x1", amount: 100 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("proxies request to ledger credit API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ digest: "d1" }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const res = await POST(makePost({ user: "0x1", amount: 100 }));
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
