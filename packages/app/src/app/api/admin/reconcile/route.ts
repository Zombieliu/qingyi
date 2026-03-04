import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";

function toReconcileErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  if (message.includes("Code generation from strings disallowed")) {
    return NextResponse.json(
      {
        error: "edge_runtime_incompatible_db",
        message: "reconcile currently requires Node runtime database access",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: "reconcile_failed", message }, { status: 500 });
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7", 10);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = new Date();

  try {
    const { reconcileOrders } = await import("@/lib/services/reconcile-service");
    const report = await reconcileOrders({ from, to });
    return NextResponse.json(report);
  } catch (error) {
    return toReconcileErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7", 10);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = new Date();

  try {
    const { reconcileOrders, autoFixReconcile } = await import("@/lib/services/reconcile-service");
    const report = await reconcileOrders({ from, to });
    const result = await autoFixReconcile(report);
    return NextResponse.json({ report, autoFix: result });
  } catch (error) {
    return toReconcileErrorResponse(error);
  }
}
