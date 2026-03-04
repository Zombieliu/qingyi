import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

import { checkEdgeDatabaseHealthRead } from "../health-read-store";

const originalEnv = { ...process.env };

function setEdgeEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_ANON_KEY = "edge-anon-key";
}

describe("edge db health read store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EDGE_DB_REST_URL;
    delete process.env.EDGE_DB_REST_ANON_KEY;
    delete process.env.EDGE_DB_REST_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("checks rest health endpoint with edge read credentials", async () => {
    setEdgeEnv();
    mocks.fetch.mockResolvedValue({ ok: true });

    await checkEdgeDatabaseHealthRead();

    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      apikey: "edge-anon-key",
      authorization: "Bearer edge-anon-key",
      accept: "application/openapi+json",
    });
  });

  it("throws descriptive error when rest health check fails", async () => {
    setEdgeEnv();
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    await expect(checkEdgeDatabaseHealthRead()).rejects.toThrow(
      "edge_db_healthcheck_failed:401:unauthorized"
    );
  });

  it("throws edge_db_not_configured without required env", async () => {
    await expect(checkEdgeDatabaseHealthRead()).rejects.toThrow("edge_db_not_configured");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
