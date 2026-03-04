import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

import {
  getPlayerByAddressEdgeRead,
  updatePlayerStatusByAddressEdgeWrite,
} from "../player-status-store";

const originalEnv = { ...process.env };

function setEdgeReadEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_ANON_KEY = "edge-anon-key";
}

function setEdgeWriteEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_SERVICE_KEY = "edge-service-key";
}

describe("edge db player status store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EDGE_DB_REST_URL;
    delete process.env.EDGE_DB_REST_ANON_KEY;
    delete process.env.EDGE_DB_REST_KEY;
    delete process.env.EDGE_DB_REST_SERVICE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns no player for empty address", async () => {
    setEdgeReadEnv();

    const result = await getPlayerByAddressEdgeRead("   ");

    expect(result).toEqual({ player: null, conflict: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns player for a single address match", async () => {
    setEdgeReadEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "P-1", status: "可接单" }],
    });

    const result = await getPlayerByAddressEdgeRead("0xABC");

    expect(result).toEqual({
      player: { id: "P-1", status: "可接单" },
      conflict: false,
    });
    const [url] = mocks.fetch.mock.calls[0] as [string];
    expect(url).toContain("/rest/v1/AdminPlayer");
    expect(url).toContain("select=id%2Cstatus");
    expect(url).toContain("address=ilike.0xabc");
    expect(url).toContain("deletedAt=is.null");
    expect(url).toContain("limit=2");
  });

  it("returns conflict when duplicate address rows are found", async () => {
    setEdgeReadEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "P-2", status: "可接单" },
        { id: "P-1", status: "忙碌" },
      ],
    });

    const result = await getPlayerByAddressEdgeRead("0xabc");

    expect(result).toEqual({ player: null, conflict: true });
  });

  it("returns conflict when update sees duplicate address rows", async () => {
    setEdgeWriteEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "P-2", status: "可接单" },
        { id: "P-1", status: "忙碌" },
      ],
    });

    const result = await updatePlayerStatusByAddressEdgeWrite("0xabc", "忙碌");

    expect(result).toEqual({ player: null, conflict: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns no player when update lookup has no match", async () => {
    setEdgeWriteEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await updatePlayerStatusByAddressEdgeWrite("0xabc", "忙碌");

    expect(result).toEqual({ player: null, conflict: false });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("updates status through write path", async () => {
    setEdgeWriteEnv();
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "P-1", status: "可接单" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "P-1", status: "忙碌" }],
      });

    const result = await updatePlayerStatusByAddressEdgeWrite("0xabc", "忙碌");

    expect(result).toEqual({
      player: { id: "P-1", status: "忙碌" },
      conflict: false,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    const [url, init] = mocks.fetch.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/rest/v1/AdminPlayer");
    expect(url).toContain("id=eq.P-1");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({
      apikey: "edge-service-key",
      authorization: "Bearer edge-service-key",
      prefer: "return=representation",
    });
  });

  it("returns no player when write update request fails", async () => {
    setEdgeWriteEnv();
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "P-1", status: "可接单" }],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "boom",
      });

    const result = await updatePlayerStatusByAddressEdgeWrite("0xabc", "忙碌");

    expect(result).toEqual({ player: null, conflict: false });
  });
});
