import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (vercelCron) return true;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const url = new URL(req.url);
  const token = req.headers.get("x-cron-secret") || url.searchParams.get("token") || "";
  return token === secret;
}

async function prune(model: { count: () => Promise<number>; findMany: any; deleteMany: any }, max: number) {
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
  await model.deleteMany({ where: { id: { in: old.map((item: { id: string }) => item.id) } } });
  return old.length;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const maxAudit = Number(process.env.ADMIN_AUDIT_LOG_LIMIT || "1000");
  const maxPayments = Number(process.env.ADMIN_PAYMENT_EVENT_LIMIT || "1000");

  const deletedAudit = await prune(prisma.adminAuditLog, maxAudit);
  const deletedPayments = await prune(prisma.adminPaymentEvent, maxPayments);

  return NextResponse.json({ ok: true, deletedAudit, deletedPayments });
}
