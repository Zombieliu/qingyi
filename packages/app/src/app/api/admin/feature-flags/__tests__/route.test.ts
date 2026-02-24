import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockGetAllFlagsAsync, mockSetFlagOverride, mockClearFlagOverride } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockGetAllFlagsAsync: vi.fn(),
    mockSetFlagOverride: vi.fn(),
    mockClearFlagOverride: vi.fn(),
  }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/feature-flags", () => ({
  getAllFlagsAsync: mockGetAllFlagsAsync,
  setFlagOverride: mockSetFlagOverride,
  clearFlagOverride: mockClearFlagOverride,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

const sampleFlags = [
  { flag: "dispute_flow", enabled: false, source: "default" },
  { flag: "credit_system", enabled: true, source: "default" },
];

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/feature-flags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetAllFlagsAsync.mockResolvedValue(sampleFlags);
});

describe("GET /api/admin/feature-flags", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/feature-flags"));
    expect(res.status).toBe(401);
  });

  it("returns all flags on success", async () => {
    const res = await GET(new Request("http://localhost/api/admin/feature-flags"));
    const json = await res.json();
    expect(json.flags).toEqual(sampleFlags);
  });
});

describe("POST /api/admin/feature-flags", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ flag: "dispute_flow", enabled: true }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when flag is missing", async () => {
    const res = await POST(makePostRequest({ enabled: true }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("flag required");
  });
  it("returns 400 when neither enabled nor clear is provided", async () => {
    const res = await POST(makePostRequest({ flag: "dispute_flow" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("enabled (boolean) or clear required");
  });

  it("sets flag override when enabled is boolean", async () => {
    const res = await POST(makePostRequest({ flag: "dispute_flow", enabled: true }));
    expect(res.status).toBe(200);
    expect(mockSetFlagOverride).toHaveBeenCalledWith("dispute_flow", true);
    const json = await res.json();
    expect(json.flags).toEqual(sampleFlags);
  });

  it("clears flag override when clear is true", async () => {
    const res = await POST(makePostRequest({ flag: "dispute_flow", clear: true }));
    expect(res.status).toBe(200);
    expect(mockClearFlagOverride).toHaveBeenCalledWith("dispute_flow");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/admin/feature-flags", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid request");
  });

  it("prefers clear over enabled when both are provided", async () => {
    const res = await POST(makePostRequest({ flag: "dispute_flow", enabled: true, clear: true }));
    expect(res.status).toBe(200);
    expect(mockClearFlagOverride).toHaveBeenCalledWith("dispute_flow");
    expect(mockSetFlagOverride).not.toHaveBeenCalled();
  });
});
