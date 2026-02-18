import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { queryOrders } from "@/lib/admin/admin-store";

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const raw = value === null || value === undefined ? "" : String(value);
    if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
      return `"${raw.replace(/"/g, "\"\"")}"`;
    }
    return raw;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => escape(row[key])).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage") || undefined;
  const q = searchParams.get("q") || undefined;
  const paymentStatus = searchParams.get("paymentStatus") || undefined;
  const assignedTo = searchParams.get("assignedTo") || undefined;
  const format = (searchParams.get("format") || "csv").toLowerCase();
  const result = await queryOrders({
    page: 1,
    pageSize: 5000,
    stage,
    q,
    paymentStatus,
    assignedTo,
  });

  if (format === "json") {
    return NextResponse.json(result.items);
  }

  const rows = result.items.map((order) => ({
    id: order.id,
    user: order.user,
    item: order.item,
    amount: order.amount,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    stage: order.stage,
    note: order.note || "",
    assignedTo: order.assignedTo || "",
    source: order.source || "",
    createdAt: new Date(order.createdAt).toISOString(),
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : "",
  }));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"orders-${Date.now()}.csv\"`,
    },
  });
}
