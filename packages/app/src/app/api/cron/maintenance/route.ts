import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { acquireCronLock } from "@/lib/cron-lock";
import { env } from "@/lib/env";

type PrunableModel = {
  count: () => Promise<number>;
  findMany: (args: {
    orderBy: { createdAt: "asc" | "desc" };
    skip: number;
    take: number;
    select: { id: true };
  }) => Promise<Array<{ id: string }>>;
  deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<unknown>;
};

function isAuthorized(req: Request) {
  const secret = env.CRON_SECRET;
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (vercelCron) return true;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const url = new URL(req.url);
  const token = req.headers.get("x-cron-secret") || url.searchParams.get("token") || "";
  return token === secret;
}

async function prune(model: PrunableModel, max: number) {
  if (!Number.isFinite(max) || max <= 0) return 0;
  const total = await model.count();
  const excess = total - max;
  if (excess <= 0) return 0;
  const old = await model.findMany({
    orderBy: { createdAt: "desc" },
    skip: max,
    take: excess,
    select: { id: true },
  });
  if (!old.length) return 0;
  await model.deleteMany({ where: { id: { in: old.map((item) => item.id) } } });
  return old.length;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await acquireCronLock("maintenance", env.CRON_LOCK_TTL_MS))) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  const maxAudit = env.ADMIN_AUDIT_LOG_LIMIT;
  const maxPayments = env.ADMIN_PAYMENT_EVENT_LIMIT;
  const retentionDays = env.ORDER_RETENTION_DAYS;

  const deletedAudit = await prune(prisma.adminAuditLog, maxAudit);
  const deletedPayments = await prune(prisma.adminPaymentEvent, maxPayments);
  let deletedOrders = 0;
  if (Number.isFinite(retentionDays) && retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await prisma.adminOrder.deleteMany({ where: { createdAt: { lt: cutoff } } });
    deletedOrders = result.count;
  }

  return NextResponse.json({ ok: true, deletedAudit, deletedPayments, deletedOrders });
}
