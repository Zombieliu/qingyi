import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockReconcileOrders, mockAutoFixReconcile } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockReconcileOrders: vi.fn(),
  mockAutoFixReconcile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/services/reconcile-service", () => ({
  reconcileOrders: mockReconcileOrders,
  autoFixReconcile: mockAutoFixReconcile,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/reconcile");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePost(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/reconcile");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/reconcile", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns reconcile report", async () => {
    mockReconcileOrders.mockResolvedValue({ matched: 10, mismatched: 0 });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.matched).toBe(10);
  });
});

describe("POST /api/admin/reconcile", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it("runs auto fix and returns result", async () => {
    mockReconcileOrders.mockResolvedValue({ matched: 10 });
    mockAutoFixReconcile.mockResolvedValue({ fixed: 2 });
    const res = await POST(makePost());
    const json = await res.json();
    expect(json.report.matched).toBe(10);
    expect(json.autoFix.fixed).toBe(2);
  });
});
