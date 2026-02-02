import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  await prisma.adminPlayer.createMany({
    data: [
      {
        id: "seed-player-1",
        name: "阿霖",
        role: "主攻",
        contact: "wechat:alin",
        status: "可接单",
        notes: "专精冲分",
        createdAt: now,
      },
      {
        id: "seed-player-2",
        name: "小柒",
        role: "辅助",
        contact: "qq:10001",
        status: "忙碌",
        notes: "排位陪练",
        createdAt: now,
      },
      {
        id: "seed-player-3",
        name: "夜风",
        role: "指挥",
        contact: "wechat:yf",
        status: "可接单",
        notes: "战术复盘",
        createdAt: now,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.adminAnnouncement.createMany({
    data: [
      {
        id: "seed-ann-1",
        title: "运营公告：新版本开服安排",
        tag: "公告",
        content: "今晚 20:00 更新后开放新赛季活动。",
        status: "published",
        createdAt: now,
      },
      {
        id: "seed-ann-2",
        title: "安全提示：请勿泄露账号",
        tag: "安全",
        content: "官方不会索要验证码，请提高警惕。",
        status: "draft",
        createdAt: now,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.adminOrder.createMany({
    data: [
      {
        id: "seed-order-1",
        user: "seed-user-1",
        item: "冲分陪练 2 小时",
        amount: 199,
        currency: "CNY",
        paymentStatus: "已支付",
        stage: "进行中",
        note: "优先安排主攻",
        assignedTo: "阿霖",
        source: "seed",
        createdAt: now,
      },
      {
        id: "seed-order-2",
        user: "seed-user-2",
        item: "新手上手教学",
        amount: 99,
        currency: "CNY",
        paymentStatus: "待确认",
        stage: "待处理",
        note: "周末时间",
        assignedTo: "",
        source: "seed",
        createdAt: now,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.adminAuditLog.createMany({
    data: [
      {
        id: "seed-audit-1",
        actorRole: "admin",
        actorSessionId: "seed-session",
        action: "seed.init",
        targetType: "system",
        targetId: "bootstrap",
        meta: { source: "seed" },
        ip: "127.0.0.1",
        createdAt: now,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.adminPaymentEvent.createMany({
    data: [
      {
        id: "seed-pay-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        orderNo: "seed-order-1",
        amount: 199,
        status: "paid",
        verified: false,
        createdAt: now,
        raw: { seed: true },
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
