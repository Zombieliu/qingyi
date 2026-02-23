import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  createUserSession,
  clearUserSessionCookie,
  revokeUserSession,
  getUserSessionFromCookies,
  getUserSessionFromTokenAllowExpired,
  renewUserSessionExpiry,
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
  const cookieStore = await cookies();
  const token = cookieStore.get("user_session")?.value || "";
  const session = await getUserSessionFromCookies();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({
    ok: true,
    address: session.address,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt ?? null,
  });
  // Sliding window: renew session if past halfway of TTL
  const ttlMs = env.USER_SESSION_TTL_HOURS * 60 * 60 * 1000;
  const remaining = session.expiresAt - Date.now();
  if (token && remaining < ttlMs / 2) {
    const newExpiry = await renewUserSessionExpiry(session.tokenHash);
    setUserSessionCookie(res, token, newExpiry);
  }
  return res;
}

/** Refresh session using existing cookie — no passkey signature required. */
export async function PATCH() {
  const cookieStore = await cookies();
  const token = cookieStore.get("user_session")?.value || "";
  const session = await getUserSessionFromTokenAllowExpired(token);
  if (!session) {
    return NextResponse.json({ error: "session_missing" }, { status: 401 });
  }
  const newExpiry = await renewUserSessionExpiry(session.tokenHash);
  const res = NextResponse.json({
    ok: true,
    address: session.address,
    expiresAt: newExpiry,
  });
  setUserSessionCookie(res, token, newExpiry);
  return res;
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
