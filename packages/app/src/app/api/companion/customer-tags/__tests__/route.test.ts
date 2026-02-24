import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCustomerTags: vi.fn(),
  addCustomerTag: vi.fn(),
}));

vi.mock("@/lib/services/customer-tag-service", () => ({
  getCustomerTags: mocks.getCustomerTags,
  addCustomerTag: mocks.addCustomerTag,
}));

import { NextRequest } from "next/server";
import { GET, POST } from "../route";

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/companion/customer-tags");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePost(body: unknown) {
  return new NextRequest("http://localhost/api/companion/customer-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/companion/customer-tags", () => {
  it("returns 400 when userAddress is missing", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("userAddress required");
  });

  it("returns tags for a user", async () => {
    mocks.getCustomerTags.mockResolvedValue({ tags: [{ tag: "rude" }] });
    const res = await GET(makeGet({ userAddress: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tags).toEqual([{ tag: "rude" }]);
    expect(mocks.getCustomerTags).toHaveBeenCalledWith("0xabc");
  });
});

describe("POST /api/companion/customer-tags", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makePost({ userAddress: "0x1" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("required");
  });

  it("returns 400 for invalid tag", async () => {
    const res = await POST(
      makePost({
        userAddress: "0x1",
        tag: "invalid_tag",
        reportedBy: "0x2",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid tag");
  });

  it("returns 400 for invalid severity", async () => {
    const res = await POST(
      makePost({
        userAddress: "0x1",
        tag: "rude",
        reportedBy: "0x2",
        severity: 5,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("severity");
  });

  it("returns 400 when tagging yourself", async () => {
    const res = await POST(
      makePost({
        userAddress: "0x1",
        tag: "rude",
        reportedBy: "0x1",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Cannot tag yourself");
  });

  it("creates tag successfully", async () => {
    mocks.addCustomerTag.mockResolvedValue({ id: "t1", tag: "rude" });
    const res = await POST(
      makePost({
        userAddress: "0x1",
        tag: "rude",
        reportedBy: "0x2",
        note: "test note",
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("t1");
    expect(mocks.addCustomerTag).toHaveBeenCalledWith({
      userAddress: "0x1",
      tag: "rude",
      note: "test note",
      severity: 1,
      reportedBy: "0x2",
      reportedByRole: "companion",
    });
  });

  it("uses default severity of 1", async () => {
    mocks.addCustomerTag.mockResolvedValue({ id: "t2" });
    await POST(
      makePost({
        userAddress: "0x1",
        tag: "difficult",
        reportedBy: "0x2",
      })
    );
    expect(mocks.addCustomerTag).toHaveBeenCalledWith(expect.objectContaining({ severity: 1 }));
  });

  it("uses provided severity", async () => {
    mocks.addCustomerTag.mockResolvedValue({ id: "t3" });
    await POST(
      makePost({
        userAddress: "0x1",
        tag: "difficult",
        reportedBy: "0x2",
        severity: 3,
      })
    );
    expect(mocks.addCustomerTag).toHaveBeenCalledWith(expect.objectContaining({ severity: 3 }));
  });
});
