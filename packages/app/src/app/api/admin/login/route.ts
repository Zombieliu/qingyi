import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  enforceLoginRateLimit,
  getAdminRoleForToken,
} from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin-audit";

export async function POST(req: Request) {
  if (!(await enforceLoginRateLimit(req))) {
    return NextResponse.json({ error: "登录过于频繁" }, { status: 429 });
  }

  let body: { token?: string } = {};
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "密钥错误" }, { status: 401 });
  }

  const roleEntry = getAdminRoleForToken(token);
  if (!roleEntry) {
    return NextResponse.json({ error: "密钥错误" }, { status: 401 });
  }

  let sessionResult: Awaited<ReturnType<typeof createAdminSession>>;
  try {
    sessionResult = await createAdminSession({
      role: roleEntry.role,
      label: roleEntry.label,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req.headers.get("user-agent") || undefined,
    });
  } catch (error) {
    console.error("admin login: failed to create session", error);
    return NextResponse.json({ error: "服务暂不可用" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true, role: roleEntry.role });
  await recordAudit(req, { role: roleEntry.role, sessionId: sessionResult.session.id, authType: "login" }, "auth.login");
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: sessionResult.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * Number(process.env.ADMIN_SESSION_TTL_HOURS || "12"),
  });
  return response;
}
