import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

import {
  getMemberByAddressEdgeRead,
  getMembershipTierByIdEdgeRead,
  getReferralByInviteeEdgeRead,
  listActiveCouponsEdgeRead,
  listPlayersPublicEdgeRead,
  listSupportTicketsByAddressEdgeRead,
  queryReferralsByInviterEdgeRead,
} from "../user-read-store";

const originalEnv = { ...process.env };

function setEdgeEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_ANON_KEY = "edge-anon-key";
}

describe("edge db user read store", () => {
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
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("maps and filters active coupons with deterministic clock", async () => {
    setEdgeEnv();
    const now = Date.parse("2026-03-01T00:00:00.000Z");
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "C-1",
          title: "active",
          code: "SAVE",
          description: null,
          discount: "12.50",
          minSpend: "100",
          status: "可用",
          startsAt: "2026-02-01T00:00:00.000Z",
          expiresAt: "2026-04-01T00:00:00.000Z",
          createdAt: "2026-02-20T00:00:00.000Z",
          updatedAt: "2026-02-21T00:00:00.000Z",
        },
        {
          id: "C-2",
          title: "expired",
          code: null,
          description: null,
          discount: "8",
          minSpend: null,
          status: "可用",
          startsAt: null,
          expiresAt: "2026-02-15T00:00:00.000Z",
          createdAt: "2026-02-10T00:00:00.000Z",
          updatedAt: null,
        },
      ],
    });

    const rows = await listActiveCouponsEdgeRead(now);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "C-1",
      code: "SAVE",
      discount: 12.5,
      minSpend: 100,
      status: "可用",
    });
    const [url] = mocks.fetch.mock.calls[0] as [string];
    expect(url).toContain("/rest/v1/AdminCoupon");
    expect(url).toContain("status=eq.%E5%8F%AF%E7%94%A8");
  });

  it("maps players for public list", async () => {
    setEdgeEnv();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "P-1",
          name: "Alice",
          role: "陪玩",
          status: "可接单",
          depositBase: 100,
          depositLocked: "120",
        },
      ],
    });

    const rows = await listPlayersPublicEdgeRead();
    expect(rows).toEqual([
      {
        id: "P-1",
        name: "Alice",
        role: "陪玩",
        status: "可接单",
        depositBase: 100,
        depositLocked: 120,
      },
    ]);
  });

  it("returns referral status and inviter list", async () => {
    setEdgeEnv();
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "R-1",
            inviterAddress: "0x1",
            inviteeAddress: "0x2",
            status: "rewarded",
            rewardInviter: 20,
            rewardInvitee: 10,
            triggerOrderId: "O-1",
            createdAt: "2026-02-01T00:00:00.000Z",
            rewardedAt: "2026-02-02T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "R-2",
            inviterAddress: "0x1",
            inviteeAddress: "0x3",
            status: "pending",
            rewardInviter: null,
            rewardInvitee: null,
            triggerOrderId: null,
            createdAt: "2026-02-03T00:00:00.000Z",
            rewardedAt: null,
          },
        ],
      });

    const invitedBy = await getReferralByInviteeEdgeRead("0x2");
    const invites = await queryReferralsByInviterEdgeRead("0x1");

    expect(invitedBy?.inviterAddress).toBe("0x1");
    expect(invites).toHaveLength(1);
    expect(invites[0].inviteeAddress).toBe("0x3");
  });

  it("skips member lookup in visual test mode", async () => {
    setEdgeEnv();
    process.env.NEXT_PUBLIC_VISUAL_TEST = "1";

    const member = await getMemberByAddressEdgeRead("0xabc");
    expect(member).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("maps member, tier and support ticket responses", async () => {
    setEdgeEnv();
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "M-1",
            userAddress: "0xabc",
            userName: "user",
            tierId: "T-1",
            tierName: "Gold",
            points: 50,
            status: "有效",
            expiresAt: "2026-06-01T00:00:00.000Z",
            note: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "T-1",
            name: "Gold",
            level: "2",
            badge: null,
            price: "99.00",
            durationDays: 30,
            minPoints: 10,
            status: "上架",
            perks: ["tag"],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "SUP-1",
            topic: "help",
            message: "body",
            contact: "wechat",
            status: "待处理",
            reply: null,
            createdAt: "2026-02-10T00:00:00.000Z",
          },
        ],
      });

    const member = await getMemberByAddressEdgeRead("0xabc");
    const tier = await getMembershipTierByIdEdgeRead("T-1");
    const tickets = await listSupportTicketsByAddressEdgeRead("0xabc");

    expect(member?.tierId).toBe("T-1");
    expect(tier?.level).toBe(2);
    expect(tickets[0].createdAt).toBe(Date.parse("2026-02-10T00:00:00.000Z"));
  });
});
