import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  LEGACY_ADMIN_COOKIE,
  getAdminSession,
  revokeAdminSession,
} from "@/lib/admin-auth";
import { cookies } from "next/headers";
import { recordAudit } from "@/lib/admin-audit";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (sessionToken) {
    const session = await getAdminSession();
    await revokeAdminSession(sessionToken);
    if (session) {
      await recordAudit(req, { role: session.role, sessionId: session.id, authType: "logout" }, "auth.logout");
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set({
    name: LEGACY_ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
