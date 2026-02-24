import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockGetCustomerTags,
  mockAddCustomerTag,
  mockRemoveCustomerTag,
  mockListTaggedCustomers,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetCustomerTags: vi.fn(),
  mockAddCustomerTag: vi.fn(),
  mockRemoveCustomerTag: vi.fn(),
  mockListTaggedCustomers: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/services/customer-tag-service", () => ({
  getCustomerTags: mockGetCustomerTags,
  addCustomerTag: mockAddCustomerTag,
  removeCustomerTag: mockRemoveCustomerTag,
  listTaggedCustomers: mockListTaggedCustomers,
}));

import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/customer-tags");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePost(body: unknown) {
  return new NextRequest("http://localhost/api/admin/customer-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/customer-tags");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/customer-tags", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns tags for specific user", async () => {
    mockGetCustomerTags.mockResolvedValue({ tags: [] });
    const res = await GET(makeGet({ userAddress: "0x1" }));
    const json = await res.json();
    expect(json.tags).toEqual([]);
  });

  it("returns tagged customers list", async () => {
    mockListTaggedCustomers.mockResolvedValue({ items: [] });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.items).toEqual([]);
  });

  it("passes limit and offset params", async () => {
    mockListTaggedCustomers.mockResolvedValue({ items: [] });
    await GET(makeGet({ limit: "20", offset: "10" }));
    expect(mockListTaggedCustomers).toHaveBeenCalledWith({ limit: 20, offset: 10 });
  });
});

describe("POST /api/admin/customer-tags", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ userAddress: "0x1", tag: "rude" }));
    expect(res.status).toBe(401);
  });

  it("creates tag and returns 201", async () => {
    mockAddCustomerTag.mockResolvedValue({ id: "t1" });
    const res = await POST(makePost({ userAddress: "0x1", tag: "rude" }));
    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("passes custom severity", async () => {
    mockAddCustomerTag.mockResolvedValue({ id: "t1" });
    await POST(makePost({ userAddress: "0x1", tag: "rude", severity: 4 }));
    expect(mockAddCustomerTag).toHaveBeenCalledWith(expect.objectContaining({ severity: 4 }));
  });

  it("uses default severity of 2 when not provided", async () => {
    mockAddCustomerTag.mockResolvedValue({ id: "t1" });
    await POST(makePost({ userAddress: "0x1", tag: "rude" }));
    expect(mockAddCustomerTag).toHaveBeenCalledWith(expect.objectContaining({ severity: 2 }));
  });
});

describe("DELETE /api/admin/customer-tags", () => {
  it("returns 400 when id is missing", async () => {
    const res = await DELETE(makeDelete());
    expect(res.status).toBe(400);
  });

  it("removes tag successfully", async () => {
    mockRemoveCustomerTag.mockResolvedValue(undefined);
    const res = await DELETE(makeDelete({ id: "t1" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
