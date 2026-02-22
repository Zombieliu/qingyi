import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/lib/services/notification-service";

/**
 * GET /api/notifications?address=xxx&page=1&pageSize=20
 * GET /api/notifications?address=xxx&unreadOnly=1
 * GET /api/notifications?address=xxx&countOnly=1  → { unread: number }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "notifications:read", address });
  if (!auth.ok) return auth.response;

  // Count only mode
  if (searchParams.get("countOnly") === "1") {
    const unread = await getUnreadCount(auth.address);
    return NextResponse.json({ unread });
  }

  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const result = await getNotifications(auth.address, page, pageSize);

  return NextResponse.json({
    ...result,
    items: result.items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      orderId: n.orderId,
      read: n.read,
      createdAt: n.createdAt.getTime(),
    })),
  });
}

/**
 * PATCH /api/notifications — mark read
 * body: { id: "NTF-xxx" } or { all: true }
 */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    address?: string;
    id?: string;
    all?: boolean;
  };
  const address = (body.address || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "notifications:update", address });
  if (!auth.ok) return auth.response;

  if (body.all) {
    const count = await markAllAsRead(auth.address);
    return NextResponse.json({ ok: true, marked: count });
  }

  if (body.id) {
    const result = await markAsRead(body.id, auth.address);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "id or all required" }, { status: 400 });
}
