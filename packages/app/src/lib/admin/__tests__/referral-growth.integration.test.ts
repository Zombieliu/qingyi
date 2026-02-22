/**
 * Integration tests for Referral + GrowthEvent — real Prisma + Postgres
 */
import { describe, it, expect } from "vitest";
import { setupIntegrationTests } from "@/test/integration-setup";
import { randomUUID } from "crypto";

const { getPrisma } = setupIntegrationTests();

describe("Referral integration", () => {
  it("creates referral relationship", async () => {
    const prisma = getPrisma();
    const ref = await prisma.referral.create({
      data: {
        id: randomUUID(),
        inviterAddress: "0xinviter",
        inviteeAddress: "0xinvitee",
        status: "pending",
        createdAt: new Date(),
      },
    });
    expect(ref.id).toBeDefined();
    expect(ref.status).toBe("pending");
  });

  it("finds referral by invitee", async () => {
    const prisma = getPrisma();
    await prisma.referral.create({
      data: {
        id: randomUUID(),
        inviterAddress: "0xa",
        inviteeAddress: "0xb",
        status: "pending",
        createdAt: new Date(),
      },
    });

    const existing = await prisma.referral.findFirst({
      where: { inviteeAddress: "0xb" },
    });
    expect(existing).not.toBeNull();
    expect(existing!.inviterAddress).toBe("0xa");
  });

  it("updates referral status to rewarded", async () => {
    const prisma = getPrisma();
    const ref = await prisma.referral.create({
      data: {
        id: randomUUID(),
        inviterAddress: "0xa",
        inviteeAddress: "0xb",
        status: "pending",
        createdAt: new Date(),
      },
    });

    const updated = await prisma.referral.update({
      where: { id: ref.id },
      data: { status: "rewarded" },
    });
    expect(updated.status).toBe("rewarded");
  });
});

describe("GrowthEvent integration", () => {
  it("creates analytics event and queries by date", async () => {
    const prisma = getPrisma();
    await prisma.growthEvent.create({
      data: {
        id: randomUUID(),
        event: "daily_checkin",
        userAddress: "0xuser",
        createdAt: new Date(),
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayEvents = await prisma.growthEvent.findMany({
      where: {
        userAddress: "0xuser",
        event: "daily_checkin",
        createdAt: { gte: today, lt: tomorrow },
      },
    });
    expect(todayEvents).toHaveLength(1);
  });

  it("counts events by user", async () => {
    const prisma = getPrisma();
    const now = new Date();
    await Promise.all([
      prisma.growthEvent.create({
        data: { id: randomUUID(), event: "daily_checkin", userAddress: "0xu1", createdAt: now },
      }),
      prisma.growthEvent.create({
        data: { id: randomUUID(), event: "order_complete", userAddress: "0xu1", createdAt: now },
      }),
      prisma.growthEvent.create({
        data: { id: randomUUID(), event: "daily_checkin", userAddress: "0xu2", createdAt: now },
      }),
    ]);

    const agg = await prisma.growthEvent.groupBy({
      by: ["userAddress"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    expect(agg[0].userAddress).toBe("0xu1");
    expect(agg[0]._count.id).toBe(2);
  });
});
