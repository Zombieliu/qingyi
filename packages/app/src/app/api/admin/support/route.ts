import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addSupportTicket, querySupportTickets, querySupportTicketsCursor } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminSupportTicket, SupportStatus } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await querySupportTicketsCursor({
      pageSize,
      status: status || undefined,
      q: q || undefined,
      cursor: cursor || undefined,
    });
    return NextResponse.json({
      items: result.items,
      nextCursor: encodeCursorParam(result.nextCursor),
    });
  }

  const result = await querySupportTickets({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminSupportTicket> = {};
  try {
    body = (await req.json()) as Partial<AdminSupportTicket>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const ticket: AdminSupportTicket = {
    id: body.id || `SUP-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    userName: body.userName,
    userAddress: body.userAddress,
    contact: body.contact,
    topic: body.topic,
    message: body.message,
    status: (body.status as SupportStatus) || "待处理",
    note: body.note,
    meta: body.meta,
    createdAt: Date.now(),
  };

  await addSupportTicket(ticket);
  await recordAudit(req, auth, "support.create", "support", ticket.id, {
    topic: ticket.topic,
    status: ticket.status,
  });

  return NextResponse.json(ticket, { status: 201 });
}
