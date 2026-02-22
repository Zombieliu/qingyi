/**
 * Integration tests for Notification — real Prisma + Postgres
 */
import { describe, it, expect } from "vitest";
import { setupIntegrationTests } from "@/test/integration-setup";
import { randomUUID } from "crypto";

const { getPrisma } = setupIntegrationTests();

describe("Notification integration", () => {
  it("creates and reads notifications", async () => {
    const prisma = getPrisma();
    const addr = "0x" + "a".repeat(64);
    const notif = await prisma.notification.create({
      data: {
        id: randomUUID(),
        userAddress: addr,
        type: "order_update",
        title: "订单更新",
        body: "您的订单已确认",
        createdAt: new Date(),
      },
    });
    expect(notif.id).toBeDefined();
    expect(notif.read).toBe(false);

    const unread = await prisma.notification.findMany({
      where: { userAddress: addr, read: false },
    });
    expect(unread).toHaveLength(1);
  });

  it("marks notification as read", async () => {
    const prisma = getPrisma();
    const notif = await prisma.notification.create({
      data: {
        id: randomUUID(),
        userAddress: "0xuser1",
        type: "level_up",
        title: "升级",
        body: "恭喜升级到白银",
        createdAt: new Date(),
      },
    });

    await prisma.notification.update({
      where: { id: notif.id },
      data: { read: true },
    });

    const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
    expect(updated!.read).toBe(true);
  });

  it("counts unread notifications", async () => {
    const prisma = getPrisma();
    const addr = "0xcount_test";
    const now = new Date();
    await Promise.all([
      prisma.notification.create({
        data: {
          id: randomUUID(),
          userAddress: addr,
          type: "t",
          title: "t1",
          body: "b1",
          createdAt: now,
        },
      }),
      prisma.notification.create({
        data: {
          id: randomUUID(),
          userAddress: addr,
          type: "t",
          title: "t2",
          body: "b2",
          createdAt: now,
        },
      }),
      prisma.notification.create({
        data: {
          id: randomUUID(),
          userAddress: addr,
          type: "t",
          title: "t3",
          body: "b3",
          read: true,
          createdAt: now,
        },
      }),
    ]);

    const count = await prisma.notification.count({ where: { userAddress: addr, read: false } });
    expect(count).toBe(2);
  });

  it("deletes old notifications", async () => {
    const prisma = getPrisma();
    const addr = "0xcleanup";
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.notification.create({
      data: {
        id: randomUUID(),
        userAddress: addr,
        type: "test",
        title: "old",
        body: "old",
        createdAt: old,
      },
    });
    await prisma.notification.create({
      data: {
        id: randomUUID(),
        userAddress: addr,
        type: "test",
        title: "new",
        body: "new",
        createdAt: new Date(),
      },
    });

    await prisma.notification.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });

    const remaining = await prisma.notification.findMany({ where: { userAddress: addr } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("new");
  });
});
