import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionTokenFromCookies,
  requireAdmin,
  rotateAdminSession,
} from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const currentToken = await getAdminSessionTokenFromCookies();
  if (!currentToken) {
    return NextResponse.json({ error: "session_missing" }, { status: 401 });
  }
  const rotated = await rotateAdminSession(currentToken);
  if (!rotated) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: rotated.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * Number(process.env.ADMIN_SESSION_TTL_HOURS || "12"),
  });
  await recordAudit(req, auth, "auth.rotate");
  return response;
}
