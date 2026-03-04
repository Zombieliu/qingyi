import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockAddAccessToken, mockListAccessTokens, mockRecordAudit } = vi.hoisted(
  () => ({
    mockRequireAdmin: vi.fn(),
    mockAddAccessToken: vi.fn(),
    mockListAccessTokens: vi.fn(),
    mockRecordAudit: vi.fn(),
  })
);

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/session-store-edge", () => ({
  addAccessToken: mockAddAccessToken,
  listAccessTokens: mockListAccessTokens,
}));

vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mockRecordAudit,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

function makeGetRequest() {
  return new Request("http://localhost/api/admin/tokens");
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

// ─── GET ───────────────────────────────────────────────

describe("GET /api/admin/tokens", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns list of tokens without tokenHash", async () => {
    mockListAccessTokens.mockResolvedValue([
      {
        id: "ATK-1",
        tokenHash: "secret-hash",
        tokenPrefix: "abc123",
        role: "admin",
        label: "test",
        status: "active",
        createdAt: 1000,
      },
    ]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("ATK-1");
    expect(json[0].tokenPrefix).toBe("abc123");
    expect(json[0].tokenHash).toBeUndefined();
  });

  it("returns empty array when no tokens exist", async () => {
    mockListAccessTokens.mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

// ─── POST ──────────────────────────────────────────────
describe("POST /api/admin/tokens", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ role: "admin" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when role is invalid", async () => {
    const res = await POST(makePostRequest({ role: "superadmin" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/admin/tokens", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates token with role admin and returns 201", async () => {
    mockAddAccessToken.mockImplementation((entry: unknown) => entry);
    const res = await POST(makePostRequest({ role: "admin" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(typeof json.token).toBe("string");
    expect(json.token.length).toBe(48);
    expect(json.item.role).toBe("admin");
    expect(json.item.status).toBe("active");
    expect(json.item.id).toMatch(/^ATK-/);
    expect(json.item.tokenHash).toBeUndefined();
  });

  it("creates token with label", async () => {
    mockAddAccessToken.mockImplementation((entry: unknown) => entry);
    const res = await POST(makePostRequest({ role: "ops", label: "CI token" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.item.label).toBe("CI token");
  });

  it("calls recordAudit after creation", async () => {
    mockAddAccessToken.mockImplementation((entry: unknown) => entry);
    await POST(makePostRequest({ role: "viewer" }));
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      authOk,
      "tokens.create",
      "access_token",
      expect.stringMatching(/^ATK-/),
      expect.objectContaining({ role: "viewer", status: "active" })
    );
  });

  it("accepts disabled status", async () => {
    mockAddAccessToken.mockImplementation((entry: unknown) => entry);
    const res = await POST(makePostRequest({ role: "finance", status: "disabled" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.item.status).toBe("disabled");
  });
});
