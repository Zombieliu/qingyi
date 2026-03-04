import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7", 10);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = new Date();

  const reconcileServicePath = "@/lib/services/reconcile-service";
  const { reconcileOrders } = await import(reconcileServicePath);
  const report = await reconcileOrders({ from, to });
  return NextResponse.json(report);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7", 10);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = new Date();

  const reconcileServicePath = "@/lib/services/reconcile-service";
  const { reconcileOrders, autoFixReconcile } = await import(reconcileServicePath);
  const report = await reconcileOrders({ from, to });
  const result = await autoFixReconcile(report);
  return NextResponse.json({ report, autoFix: result });
}
