import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { updateMantouWithdrawStatus } from "@/lib/admin/admin-store";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  const { requestId } = await params;
  let payload: { status?: "已通过" | "已打款" | "已拒绝" | "已退回"; note?: string } = {};
  try {
    payload = (await req.json()) as { status?: "已通过" | "已打款" | "已拒绝" | "已退回"; note?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.status) {
    return NextResponse.json({ error: "status required" }, { status: 400 });
  }
  try {
    const updated = await updateMantouWithdrawStatus({
      id: requestId,
      status: payload.status,
      note: payload.note,
    });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "update failed" }, { status: 500 });
  }
}
