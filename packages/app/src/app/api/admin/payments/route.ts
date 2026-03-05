import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { queryPaymentEvents, queryPaymentEventsCursor } from "@/lib/admin/admin-store";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";
import { parseIntegerQueryParam } from "@/lib/shared/query-params";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const page = parseIntegerQueryParam(searchParams.get("page"), { fallback: 1, min: 1 });
  const pageSize = parseIntegerQueryParam(searchParams.get("pageSize"), {
    fallback: 30,
    min: 10,
    max: 200,
  });
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await queryPaymentEventsCursor({ pageSize, cursor: cursor || undefined });
    return NextResponse.json({
      items: result.items,
      nextCursor: encodeCursorParam(result.nextCursor),
    });
  }
  const result = await queryPaymentEvents({ page, pageSize });
  return NextResponse.json(result);
}
