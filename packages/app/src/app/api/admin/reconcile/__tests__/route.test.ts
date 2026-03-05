import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockReconcileOrders, mockAutoFixReconcile, mockAlertEdgeIncompatible } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockReconcileOrders: vi.fn(),
    mockAutoFixReconcile: vi.fn(),
    mockAlertEdgeIncompatible: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/services/reconcile-service", () => ({
  reconcileOrders: mockReconcileOrders,
  autoFixReconcile: mockAutoFixReconcile,
}));
vi.mock("@/lib/services/alert-service", () => ({
  alertOnEdgeRuntimeIncompatibleDb: (...args: unknown[]) => mockAlertEdgeIncompatible(...args),
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
  delete (globalThis as { WebSocketPair?: unknown }).WebSocketPair;
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

  it("returns 503 and alerts when running in worker runtime", async () => {
    (globalThis as { WebSocketPair?: unknown }).WebSocketPair = function WebSocketPair() {};
    const res = await GET(makeGet());
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error).toBe("edge_runtime_incompatible_db");
    expect(mockAlertEdgeIncompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/api/admin/reconcile",
        role: "finance",
      })
    );
  });

  it("returns 503 and alerts when reconcile import path throws edge-incompatible error", async () => {
    mockReconcileOrders.mockRejectedValue(
      new Error("Code generation from strings disallowed for this context")
    );
    const res = await GET(makeGet());
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error).toBe("edge_runtime_incompatible_db");
    expect(mockAlertEdgeIncompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/api/admin/reconcile",
        role: "finance",
      })
    );
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

  it("returns 503 and alerts when worker runtime short-circuit is hit", async () => {
    (globalThis as { WebSocketPair?: unknown }).WebSocketPair = function WebSocketPair() {};
    const res = await POST(makePost());
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error).toBe("edge_runtime_incompatible_db");
    expect(mockAlertEdgeIncompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/admin/reconcile",
        role: "admin",
      })
    );
  });

  it("returns 503 and alerts when reconcile path throws edge-incompatible error", async () => {
    mockReconcileOrders.mockRejectedValue(
      new Error("Code generation from strings disallowed for this context")
    );
    const res = await POST(makePost());
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error).toBe("edge_runtime_incompatible_db");
    expect(mockAlertEdgeIncompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/admin/reconcile",
        role: "admin",
      })
    );
  });
});
