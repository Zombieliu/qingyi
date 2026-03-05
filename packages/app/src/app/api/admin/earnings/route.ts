import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getCompanionEarnings } from "@/lib/admin/admin-store";
import { parseIntegerQueryParam } from "@/lib/shared/query-params";

function parseDateParam(raw: string | null, endOfDay = false) {
  if (!raw) return undefined;
  const numeric = Number(raw);
  let value: Date;
  if (!Number.isNaN(numeric)) {
    value = new Date(numeric);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    value = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  } else {
    value = new Date(raw);
  }
  if (Number.isNaN(value.getTime())) return undefined;
  return value;
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const from = parseDateParam(searchParams.get("from"));
  const to = parseDateParam(searchParams.get("to"), true);
  const limit = parseIntegerQueryParam(searchParams.get("limit"), {
    fallback: 50,
    min: 5,
    max: 200,
  });
  const result = await getCompanionEarnings({
    from: from?.getTime(),
    to: to?.getTime(),
    limit,
  });
  return NextResponse.json({
    ok: true,
    range: {
      from: from ? from.getTime() : null,
      to: to ? to.getTime() : null,
    },
    ...result,
  });
}
