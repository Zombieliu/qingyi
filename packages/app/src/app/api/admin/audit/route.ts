import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { queryAuditLogs, queryAuditLogsCursor } from "@/lib/admin-store";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize") || "30")));
  const q = searchParams.get("q") || undefined;
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await queryAuditLogsCursor({ pageSize, q, cursor: cursor || undefined });
    return NextResponse.json({
      items: result.items,
      nextCursor: encodeCursorParam(result.nextCursor),
    });
  }
  const result = await queryAuditLogs({ page, pageSize, q });
  return NextResponse.json(result);
}
