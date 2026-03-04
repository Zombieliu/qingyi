import { NextResponse } from "next/server";
import { randomInt } from "@/lib/shared/runtime-crypto";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  addLiveApplication,
  queryLiveApplications,
  queryLiveApplicationsCursor,
} from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminLiveApplication, LiveStatus } from "@/lib/admin/admin-types";
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
    const result = await queryLiveApplicationsCursor({
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

  const result = await queryLiveApplications({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminLiveApplication> = {};
  try {
    body = (await req.json()) as Partial<AdminLiveApplication>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.user && !body.contact) {
    return NextResponse.json({ error: "user or contact required" }, { status: 400 });
  }

  const application: AdminLiveApplication = {
    id: body.id || `LIV-${Date.now()}-${randomInt(1000, 9999)}`,
    user: body.user,
    userAddress: body.userAddress,
    contact: body.contact,
    platform: body.platform,
    liveUrl: body.liveUrl,
    games: body.games,
    liveTime: body.liveTime,
    status: (body.status as LiveStatus) || "待审核",
    note: body.note,
    meta: body.meta,
    createdAt: Date.now(),
  };

  await addLiveApplication(application);
  await recordAudit(req, auth, "live.create", "live_application", application.id, {
    status: application.status,
  });

  return NextResponse.json(application, { status: 201 });
}
