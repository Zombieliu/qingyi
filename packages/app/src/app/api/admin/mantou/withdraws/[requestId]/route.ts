import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { updateMantouWithdrawStatus } from "@/lib/admin/admin-store";
import { parseBody } from "@/lib/shared/api-validation";

const patchSchema = z.object({
  status: z.enum(["已通过", "已打款", "已拒绝", "已退回"]),
  note: z.string().optional(),
});

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  const { requestId } = await params;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const { status, note } = parsed.data;

  try {
    const updated = await updateMantouWithdrawStatus({
      id: requestId,
      status,
      note,
    });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "update failed" },
      { status: 500 }
    );
  }
}
