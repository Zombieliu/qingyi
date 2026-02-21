import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  createUserSession,
  clearUserSessionCookie,
  revokeUserSession,
  getUserSessionFromCookies,
  requireUserSignature,
  setUserSessionCookie,
} from "@/lib/auth/user-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { env } from "@/lib/env";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";

const sessionSchema = z.object({
  address: z.string().optional(),
});

export async function POST(req: Request) {
  if (
    !(await rateLimit(
      `auth:session:${getClientIp(req)}`,
      env.AUTH_SESSION_RATE_LIMIT_MAX,
      env.AUTH_SESSION_RATE_LIMIT_WINDOW_MS
    ))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = await parseBodyRaw(req, sessionSchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const headerAddress = req.headers.get("x-auth-address") || "";
  const address = normalizeSuiAddress(payload.address || headerAddress || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const auth = await requireUserSignature(req, {
    intent: "user:session:create",
    address,
    body: rawBody || undefined,
  });
  if (!auth.ok) return auth.response;

  const { token, session } = await createUserSession({
    address,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") || undefined,
  });

  const res = NextResponse.json({
    ok: true,
    address: session.address,
    expiresAt: session.expiresAt,
  });
  setUserSessionCookie(res, token, session.expiresAt);
  return res;
}

export async function GET() {
  const session = await getUserSessionFromCookies();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    address: session.address,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt ?? null,
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get("user_session")?.value || "";
  if (token) {
    await revokeUserSession(token);
  }
  const res = NextResponse.json({ ok: true });
  clearUserSessionCookie(res);
  return res;
}
