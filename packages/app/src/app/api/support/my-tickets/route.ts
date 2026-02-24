import { NextResponse } from "next/server";
import { prisma } from "@/lib/admin/admin-store-utils";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const rows = await prisma.adminSupportTicket.findMany({
    where: { userAddress: address },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      topic: true,
      message: true,
      contact: true,
      status: true,
      reply: true,
      createdAt: true,
    },
  });

  const items = rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    message: r.message,
    contact: r.contact,
    status: r.status,
    reply: r.reply,
    createdAt: r.createdAt.getTime(),
  }));

  return NextResponse.json({ items });
}
