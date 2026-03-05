import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { alertOnEdgeRuntimeIncompatibleDb } from "@/lib/services/alert-service";
import { parseIntegerQueryParam } from "@/lib/shared/query-params";

function isWorkerRuntime() {
  return typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined";
}

async function respondEdgeRuntimeIncompatible(method: "GET" | "POST", role: "finance" | "admin") {
  try {
    await alertOnEdgeRuntimeIncompatibleDb({
      method,
      path: "/api/admin/reconcile",
      role,
      runtime: isWorkerRuntime() ? "worker" : "node",
    });
  } catch {
    // alerting should never block user-facing fallback
  }

  return NextResponse.json(
    {
      error: "edge_runtime_incompatible_db",
      message: "reconcile currently requires Node runtime database access",
    },
    { status: 503 }
  );
}

async function toReconcileErrorResponse(
  error: unknown,
  method: "GET" | "POST",
  role: "finance" | "admin"
) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  if (message.includes("Code generation from strings disallowed")) {
    return respondEdgeRuntimeIncompatible(method, role);
  }
  return NextResponse.json({ error: "reconcile_failed", message }, { status: 500 });
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  if (isWorkerRuntime()) {
    return respondEdgeRuntimeIncompatible("GET", "finance");
  }

  const { searchParams } = new URL(req.url);
  const days = parseIntegerQueryParam(searchParams.get("days"), { fallback: 7, min: 1, max: 30 });
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = new Date();

  try {
    const { reconcileOrders } = await import("@/lib/services/reconcile-service");
    const report = await reconcileOrders({ from, to });
    return NextResponse.json(report);
  } catch (error) {
    return toReconcileErrorResponse(error, "GET", "finance");
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  if (isWorkerRuntime()) {
    return respondEdgeRuntimeIncompatible("POST", "admin");
  }

  const { searchParams } = new URL(req.url);
  const days = parseIntegerQueryParam(searchParams.get("days"), { fallback: 7, min: 1, max: 30 });
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = new Date();

  try {
    const { reconcileOrders, autoFixReconcile } = await import("@/lib/services/reconcile-service");
    const report = await reconcileOrders({ from, to });
    const result = await autoFixReconcile(report);
    return NextResponse.json({ report, autoFix: result });
  } catch (error) {
    return toReconcileErrorResponse(error, "POST", "admin");
  }
}
