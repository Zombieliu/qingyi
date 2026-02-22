import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/companion/orders?address=xxx&status=active|completed|all&page=1&pageSize=20
 * 陪练端 — 我的订单列表
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "companion:orders:read", address });
  if (!auth.ok) return auth.response;

  const status = searchParams.get("status") || "active";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || "20")));

  const where: Record<string, unknown> = { companionAddress: auth.address };

  if (status === "active") {
    where.stage = { in: ["已支付", "进行中", "待结算"] };
  } else if (status === "completed") {
    where.stage = { in: ["已完成", "已取消", "已退款"] };
  }
  // status === "all" → no stage filter

  const [total, rows] = await Promise.all([
    prisma.adminOrder.count({ where }),
    prisma.adminOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        user: true,
        userAddress: true,
        item: true,
        amount: true,
        stage: true,
        serviceFee: true,
        chainStatus: true,
        createdAt: true,
        updatedAt: true,
        note: true,
      },
    }),
  ]);

  return NextResponse.json({
    orders: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt?.getTime() || null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
