#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const maxAudit = Number(process.env.ADMIN_AUDIT_LOG_LIMIT || "1000");
const maxPayments = Number(process.env.ADMIN_PAYMENT_EVENT_LIMIT || "1000");

async function prune(model, max) {
  if (!Number.isFinite(max) || max <= 0) return;
  const total = await model.count();
  const excess = total - max;
  if (excess <= 0) return;
  const old = await model.findMany({
    orderBy: { createdAt: "desc" },
    skip: max,
    take: excess,
    select: { id: true },
  });
  if (!old.length) return;
  await model.deleteMany({ where: { id: { in: old.map((item) => item.id) } } });
}

async function main() {
  await prune(prisma.adminAuditLog, maxAudit);
  await prune(prisma.adminPaymentEvent, maxPayments);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
