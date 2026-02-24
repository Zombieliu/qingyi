import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockQueryGuardianApplications,
  mockQueryGuardianApplicationsCursor,
  mockAddGuardianApplication,
  mockRecordAudit,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryGuardianApplications: vi.fn(),
  mockQueryGuardianApplicationsCursor: vi.fn(),
  mockAddGuardianApplication: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  queryGuardianApplications: mockQueryGuardianApplications,
  queryGuardianApplicationsCursor: mockQueryGuardianApplicationsCursor,
  addGuardianApplication: mockAddGuardianApplication,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@/lib/cursor-utils", () => ({
  decodeCursorParam: mockDecodeCursorParam,
  encodeCursorParam: mockEncodeCursorParam,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/guardians");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/guardians", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockDecodeCursorParam.mockReturnValue(null);
  mockEncodeCursorParam.mockReturnValue(null);
});

describe("GET /api/admin/guardians", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("uses cursor pagination by default", async () => {
    mockQueryGuardianApplicationsCursor.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(makeGet());
    expect(mockQueryGuardianApplicationsCursor).toHaveBeenCalled();
  });

  it("uses offset pagination when page is set", async () => {
    mockQueryGuardianApplications.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGet({ page: "1" }));
    expect(mockQueryGuardianApplications).toHaveBeenCalled();
  });
});

describe("POST /api/admin/guardians", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ user: "test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when user and contact are missing", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("creates guardian application and returns 201", async () => {
    mockAddGuardianApplication.mockResolvedValue(undefined);
    const res = await POST(makePost({ user: "test", contact: "12345678901" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toMatch(/^GUA-/);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
