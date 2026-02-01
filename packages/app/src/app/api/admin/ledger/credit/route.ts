import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const adminToken = process.env.LEDGER_ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json({ error: "LEDGER_ADMIN_TOKEN 未配置" }, { status: 500 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = new URL("/api/ledger/credit", req.url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    await recordAudit(req, auth, "ledger.credit", "ledger", undefined, {
      digest: data?.digest,
      user: (body as { user?: string }).user,
      amount: (body as { amount?: string | number }).amount,
      receiptId: (body as { receiptId?: string }).receiptId,
    });
  }
  return NextResponse.json(data, { status: res.status });
}
