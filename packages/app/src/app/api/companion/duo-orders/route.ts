import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/companion/duo-orders?address=xxx&status=active|completed|all&page=1&pageSize=20
 * 陪练端 — 我的双陪订单列表
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "companion:duo-orders:read", address });
  if (!auth.ok) return auth.response;

  const status = searchParams.get("status") || "active";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || "20")));

  const where: Record<string, unknown> = {
    OR: [{ companionAddressA: auth.address }, { companionAddressB: auth.address }],
  };

  if (status === "active") {
    where.stage = { in: ["待处理", "已确认", "进行中"] };
  } else if (status === "completed") {
    where.stage = { in: ["已完成", "已取消"] };
  }

  const [total, rows] = await Promise.all([
    prisma.duoOrder.count({ where }),
    prisma.duoOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        user: true,
        userAddress: true,
        companionAddressA: true,
        companionAddressB: true,
        item: true,
        amount: true,
        stage: true,
        serviceFee: true,
        depositPerCompanion: true,
        teamStatus: true,
        chainStatus: true,
        createdAt: true,
        updatedAt: true,
        note: true,
        meta: true,
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
