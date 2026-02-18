import { NextResponse } from "next/server";
import { getAdminSession, requireAdmin } from "@/lib/admin/admin-auth";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const session = await getAdminSession();
  return NextResponse.json({
    ok: true,
    role: auth.role,
    authType: auth.authType,
    sessionId: auth.sessionId,
    expiresAt: session?.expiresAt || null,
    label: auth.tokenLabel || null,
  });
}
