import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

import {
  getCompanionScheduleByAddressEdgeRead,
  updateCompanionScheduleByAddressEdgeWrite,
} from "../companion-schedule-store";

const originalEnv = { ...process.env };

function setEdgeReadEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_ANON_KEY = "edge-anon-key";
}

function setEdgeWriteEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_SERVICE_KEY = "edge-service-key";
}

describe("edge db companion schedule store", () => {
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

  it("returns companion schedule slots for read path", async () => {
    setEdgeReadEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          schedule: {
            slots: [
              { day: 1, start: "09:00", end: "12:00" },
              { day: 2, start: "14:00", end: "18:00" },
            ],
          },
        },
      ],
    });

    const slots = await getCompanionScheduleByAddressEdgeRead("0xabc");
    expect(slots).toEqual([
      { day: 1, start: "09:00", end: "12:00" },
      { day: 2, start: "14:00", end: "18:00" },
    ]);

    const [url] = mocks.fetch.mock.calls[0] as [string];
    expect(url).toContain("/rest/v1/AdminPlayer");
    expect(url).toContain("select=schedule");
    expect(url).toContain("address=eq.0xabc");
  });

  it("returns false when write path updates no player", async () => {
    setEdgeWriteEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const updated = await updateCompanionScheduleByAddressEdgeWrite("0xabc", [
      { day: 1, start: "09:00", end: "12:00" },
    ]);

    expect(updated).toBe(false);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/v1/AdminPlayer");
    expect(url).toContain("address=eq.0xabc");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({
      apikey: "edge-service-key",
      authorization: "Bearer edge-service-key",
      prefer: "return=representation",
    });
  });

  it("returns true when write path updates an existing player", async () => {
    setEdgeWriteEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "P-1" }],
    });

    const updated = await updateCompanionScheduleByAddressEdgeWrite("0xabc", [
      { day: 1, start: "09:00", end: "12:00" },
    ]);

    expect(updated).toBe(true);
  });

  it("throws edge_db_not_configured when write env missing", async () => {
    await expect(
      updateCompanionScheduleByAddressEdgeWrite("0xabc", [{ day: 1, start: "09:00", end: "12:00" }])
    ).rejects.toThrow("edge_db_not_configured");
  });
});
