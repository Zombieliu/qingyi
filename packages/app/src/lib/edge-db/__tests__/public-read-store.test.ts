import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

vi.mock("@/lib/server-cache", () => ({
  getCache: mocks.getCache,
  setCache: mocks.setCache,
}));

import {
  getEdgeDbConfig,
  getLeaderboardEdgeRead,
  listActiveMembershipTiersEdgeRead,
  listPublicAnnouncementsEdgeRead,
} from "../public-read-store";

const originalEnv = { ...process.env };

function setEdgeEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_ANON_KEY = "edge-anon-key";
}

describe("edge db public read store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EDGE_DB_REST_URL;
    delete process.env.EDGE_DB_REST_ANON_KEY;
    delete process.env.EDGE_DB_REST_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_VISUAL_TEST;
    delete process.env.VISUAL_TEST;

    mocks.getCache.mockReturnValue(null);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("reads config from dedicated edge env", () => {
    setEdgeEnv();
    expect(getEdgeDbConfig()).toEqual({
      baseUrl: "https://example.supabase.co",
      apiKey: "edge-anon-key",
    });
  });

  it("falls back to NEXT_PUBLIC supabase env names", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public.supabase.co/";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon";

    expect(getEdgeDbConfig()).toEqual({
      baseUrl: "https://public.supabase.co",
      apiKey: "public-anon",
    });
  });

  it("maps public announcements from edge rows", async () => {
    setEdgeEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "A-1",
          title: "notice",
          tag: "system",
          content: "hello",
          status: "published",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    const rows = await listPublicAnnouncementsEdgeRead();

    expect(rows).toEqual([
      {
        id: "A-1",
        title: "notice",
        tag: "system",
        content: "hello",
        status: "published",
        createdAt: Date.parse("2026-01-01T00:00:00.000Z"),
        updatedAt: Date.parse("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const [url] = mocks.fetch.mock.calls[0] as [string];
    expect(url).toContain("/rest/v1/AdminAnnouncement");
    expect(url).toContain("status=eq.published");
  });

  it("returns empty tiers in visual test mode", async () => {
    setEdgeEnv();
    process.env.NEXT_PUBLIC_VISUAL_TEST = "1";

    const rows = await listActiveMembershipTiersEdgeRead();
    expect(rows).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns cached leaderboard when cache is warm", async () => {
    const cached = [{ rank: 1, address: "0xabc", value: 10 }];
    mocks.getCache.mockReturnValue({ value: cached, expiresAt: Date.now() + 1000 });

    const rows = await getLeaderboardEdgeRead("spend", "all", 50);
    expect(rows).toEqual(cached);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("falls back to scan query when aggregate query fails", async () => {
    setEdgeEnv();
    mocks.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "aggregate syntax not supported",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { inviterAddress: "0x1" },
          { inviterAddress: "0x1" },
          { inviterAddress: "0x2" },
        ],
      });

    const rows = await getLeaderboardEdgeRead("referral", "all", 50);

    expect(rows).toEqual([
      { rank: 1, address: "0x1", value: 2 },
      { rank: 2, address: "0x2", value: 1 },
    ]);
    expect(mocks.setCache).toHaveBeenCalledWith("leaderboard:referral:all", rows, 60000);
  });
});
