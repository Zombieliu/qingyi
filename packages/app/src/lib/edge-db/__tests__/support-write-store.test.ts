import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

import { addSupportTicketEdgeWrite } from "../support-write-store";

const originalEnv = { ...process.env };

describe("edge db support write store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
    process.env.EDGE_DB_REST_SERVICE_KEY = "service-role-key";
    process.env.EDGE_DB_REST_ANON_KEY = "anon-key";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("inserts support ticket using write credentials", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, text: async () => "" });

    await addSupportTicketEdgeWrite({
      id: "SUP-1",
      userName: "Alice",
      userAddress: "0xabc",
      contact: "wechat",
      topic: "other",
      message: "help",
      status: "待处理",
      meta: { source: "web" },
      createdAt: Date.parse("2026-03-01T00:00:00.000Z"),
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toContain("/rest/v1/AdminSupportTicket");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer service-role-key");

    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      id: "SUP-1",
      userName: "Alice",
      userAddress: "0xabc",
      status: "待处理",
      meta: { source: "web" },
    });
    expect(payload.createdAt).toBe("2026-03-01T00:00:00.000Z");
  });
});
