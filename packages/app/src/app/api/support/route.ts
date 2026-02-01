import { NextResponse } from "next/server";
import crypto from "crypto";
import { addSupportTicket } from "@/lib/admin-store";
import type { AdminSupportTicket, SupportStatus } from "@/lib/admin-types";

export async function POST(req: Request) {
  let body: {
    name?: string;
    userName?: string;
    userAddress?: string;
    contact?: string;
    topic?: string;
    message?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const ticket: AdminSupportTicket = {
    id: `SUP-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    userName: body.name || body.userName,
    userAddress: body.userAddress,
    contact: body.contact,
    topic: body.topic || "其他",
    message,
    status: "待处理" as SupportStatus,
    createdAt: Date.now(),
  };

  await addSupportTicket(ticket);
  return NextResponse.json({ id: ticket.id, status: ticket.status });
}
