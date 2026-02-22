/**
 * Integration tests for AdminOrder — real Prisma + Postgres
 */
import { describe, it, expect } from "vitest";
import { setupIntegrationTests } from "@/test/integration-setup";
import { randomUUID } from "crypto";

const { getPrisma } = setupIntegrationTests();

const now = new Date();
const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  user: "test-user",
  userAddress: "0x" + "a".repeat(64),
  item: "三角洲行动陪练",
  amount: 100,
  currency: "CNY",
  paymentStatus: "待支付",
  stage: "待处理",
  meta: {},
  createdAt: now,
  ...overrides,
});

describe("AdminOrder integration", () => {
  it("creates and queries an order", async () => {
    const prisma = getPrisma();
    const data = makeOrder();
    const order = await prisma.adminOrder.create({ data });
    expect(order.id).toBe(data.id);
    expect(order.user).toBe("test-user");

    const found = await prisma.adminOrder.findUnique({ where: { id: order.id } });
    expect(found).not.toBeNull();
    expect(found!.amount).toBe(100);
  });

  it("filters orders by stage", async () => {
    const prisma = getPrisma();
    await prisma.adminOrder.createMany({
      data: [
        makeOrder({ stage: "进行中", paymentStatus: "已支付" }),
        makeOrder({ stage: "待处理" }),
        makeOrder({ stage: "进行中", paymentStatus: "已支付" }),
      ],
    });

    const inProgress = await prisma.adminOrder.findMany({ where: { stage: "进行中" } });
    expect(inProgress).toHaveLength(2);
  });

  it("updates order stage", async () => {
    const prisma = getPrisma();
    const order = await prisma.adminOrder.create({ data: makeOrder() });

    const updated = await prisma.adminOrder.update({
      where: { id: order.id },
      data: { stage: "已完成", paymentStatus: "已支付" },
    });
    expect(updated.stage).toBe("已完成");
  });

  it("deletes an order", async () => {
    const prisma = getPrisma();
    const order = await prisma.adminOrder.create({ data: makeOrder() });
    await prisma.adminOrder.delete({ where: { id: order.id } });
    const found = await prisma.adminOrder.findUnique({ where: { id: order.id } });
    expect(found).toBeNull();
  });

  it("paginates with cursor", async () => {
    const prisma = getPrisma();
    for (let i = 0; i < 5; i++) {
      await prisma.adminOrder.create({
        data: makeOrder({ createdAt: new Date(Date.now() - i * 1000) }),
      });
    }

    const page1 = await prisma.adminOrder.findMany({ take: 2, orderBy: { createdAt: "desc" } });
    expect(page1).toHaveLength(2);

    const page2 = await prisma.adminOrder.findMany({
      take: 2,
      skip: 1,
      cursor: { id: page1[1].id },
      orderBy: { createdAt: "desc" },
    });
    expect(page2).toHaveLength(2);
    expect(page2[0].id).not.toBe(page1[0].id);
  });
});
