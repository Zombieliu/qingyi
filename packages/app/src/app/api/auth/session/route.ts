import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  createUserSession,
  clearUserSessionCookie,
  revokeUserSession,
  requireUserSignature,
  setUserSessionCookie,
} from "@/lib/user-auth";

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  let rawBody = "";
  let payload: { address?: string } = {};
  try {
    rawBody = await req.text();
    payload = rawBody ? (JSON.parse(rawBody) as { address?: string }) : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

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
