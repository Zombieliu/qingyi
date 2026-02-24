import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAddAuditLog } = vi.hoisted(() => ({
  mockAddAuditLog: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../admin-store", () => ({
  addAuditLog: mockAddAuditLog,
}));

import { recordAudit } from "../admin-audit";

function makeRequest(headers: Record<string, string> = {}): Request {
  return { headers: new Headers(headers), method: "POST" } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAudit", () => {
  it("creates audit entry with correct fields", async () => {
    mockAddAuditLog.mockResolvedValue(undefined);
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4" });
    const actor = {
      role: "admin" as const,
      sessionId: "sess_1",
      authType: "session",
      tokenLabel: "main",
    };

    await recordAudit(req, actor, "order.update", "order", "ord_123", { extra: true });

    expect(mockAddAuditLog).toHaveBeenCalledTimes(1);
    const entry = mockAddAuditLog.mock.calls[0][0];
    expect(entry.id).toMatch(/^audit_/);
    expect(entry.actorRole).toBe("admin");
    expect(entry.actorSessionId).toBe("sess_1");
    expect(entry.action).toBe("order.update");
    expect(entry.targetType).toBe("order");
    expect(entry.targetId).toBe("ord_123");
    expect(entry.meta).toEqual({ authType: "session", tokenLabel: "main", extra: true });
    expect(entry.ip).toBe("1.2.3.4");
    expect(entry.createdAt).toBeGreaterThan(0);
  });

  it("extracts IP from x-forwarded-for (first entry)", async () => {
    mockAddAuditLog.mockResolvedValue(undefined);
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" });
    const actor = { role: "ops" as const };

    await recordAudit(req, actor, "test.action");

    const entry = mockAddAuditLog.mock.calls[0][0];
    expect(entry.ip).toBe("10.0.0.1");
  });

  it("extracts IP from x-real-ip when x-forwarded-for is absent", async () => {
    mockAddAuditLog.mockResolvedValue(undefined);
    const req = makeRequest({ "x-real-ip": "192.168.1.1" });
    const actor = { role: "viewer" as const };

    await recordAudit(req, actor, "test.action");

    const entry = mockAddAuditLog.mock.calls[0][0];
    expect(entry.ip).toBe("192.168.1.1");
  });

  it('uses "unknown" when no IP headers present', async () => {
    mockAddAuditLog.mockResolvedValue(undefined);
    const req = makeRequest({});
    const actor = { role: "finance" as const };

    await recordAudit(req, actor, "test.action");

    const entry = mockAddAuditLog.mock.calls[0][0];
    expect(entry.ip).toBe("unknown");
  });

  it("silently ignores write failures", async () => {
    mockAddAuditLog.mockRejectedValue(new Error("DB write failed"));
    const req = makeRequest({});
    const actor = { role: "admin" as const };

    // Should not throw
    await expect(recordAudit(req, actor, "test.action")).resolves.toBeUndefined();
  });
});
