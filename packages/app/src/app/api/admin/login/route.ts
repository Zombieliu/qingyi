import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  enforceAdminIpAllowlist,
  enforceLoginRateLimit,
  getAdminRoleForToken,
} from "@/lib/admin/admin-auth";
import { touchAccessTokenByHash } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import { env } from "@/lib/env";

const loginSchema = z.object({ token: z.string().trim().min(1) });

export async function POST(req: Request) {
  if (!(await enforceLoginRateLimit(req))) {
    return NextResponse.json({ error: "登录过于频繁" }, { status: 429 });
  }

  const ipCheck = enforceAdminIpAllowlist(req);
  if (ipCheck) return ipCheck;

  const parsed = await parseBody(req, loginSchema);
  if (!parsed.success) return parsed.response;
  const token = parsed.data.token;

  const roleEntry = await getAdminRoleForToken(token);
  if (!roleEntry) {
    return NextResponse.json({ error: "密钥错误" }, { status: 401 });
  }
  if (roleEntry.source === "db" && roleEntry.tokenHash) {
    await touchAccessTokenByHash(roleEntry.tokenHash);
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
  await recordAudit(
    req,
    { role: roleEntry.role, sessionId: sessionResult.session.id, authType: "login" },
    "auth.login"
  );
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: sessionResult.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * env.ADMIN_SESSION_TTL_HOURS,
  });
  return response;
}
