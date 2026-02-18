import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildAuthMessage } from "./auth-message";
import { consumeNonce } from "./rate-limit";
import {
  createUserSession as createUserSessionRecord,
  getUserSessionByHash,
  removeUserSessionByHash,
  updateUserSessionByHash,
  type UserSessionRecord,
} from "./user-session-store";
import crypto from "crypto";

const AUTH_MAX_SKEW_MS = Number(process.env.AUTH_MAX_SKEW_MS || "300000");
const AUTH_NONCE_TTL_MS = Number(process.env.AUTH_NONCE_TTL_MS || "600000");
const USER_SESSION_TTL_HOURS = Number(process.env.USER_SESSION_TTL_HOURS || "12");
const USER_SESSION_COOKIE = "user_session";

function getHeaderValue(req: Request, key: string) {
  return req.headers.get(key) || "";
}

function hashBody(body: string) {
  return crypto.createHash("sha256").update(body).digest("base64");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function ensureSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function getUserSessionTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(USER_SESSION_COOKIE)?.value || "";
}

export async function createUserSession(params: { address: string; ip?: string; userAgent?: string }) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = Date.now();
  const session: UserSessionRecord = {
    id: `us_${now}_${crypto.randomInt(1000, 9999)}`,
    tokenHash,
    address: normalizeSuiAddress(params.address),
    createdAt: now,
    expiresAt: now + USER_SESSION_TTL_HOURS * 60 * 60 * 1000,
    lastSeenAt: now,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  };
  await createUserSessionRecord(session);
  return { token, session };
}

export async function revokeUserSession(token: string) {
  if (!token) return false;
  return removeUserSessionByHash(hashToken(token));
}

export function setUserSessionCookie(res: NextResponse, token: string, expiresAt: number) {
  res.cookies.set({
    name: USER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearUserSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: USER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getUserSessionFromCookies() {
  const sessionToken = await getUserSessionTokenFromCookies();
  if (!sessionToken) return null;
  const sessionHash = hashToken(sessionToken);
  const session = await getUserSessionByHash(sessionHash);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    await removeUserSessionByHash(sessionHash);
    return null;
  }
  await updateUserSessionByHash(sessionHash, { lastSeenAt: Date.now() });
  return session;
}

export async function requireUserSignature(
  req: Request,
  params: { intent: string; address: string; body?: string }
): Promise<{ ok: true } | { ok: false; response: NextResponse } > {
  const signature = getHeaderValue(req, "x-auth-signature");
  const timestampRaw = getHeaderValue(req, "x-auth-timestamp");
  const nonce = getHeaderValue(req, "x-auth-nonce");
  const headerAddress = getHeaderValue(req, "x-auth-address");
  const bodyHashHeader = getHeaderValue(req, "x-auth-body-sha256");

  if (!signature || !timestampRaw || !nonce) {
    return { ok: false, response: NextResponse.json({ error: "auth_required" }, { status: 401 }) };
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, response: NextResponse.json({ error: "invalid_timestamp" }, { status: 400 }) };
  }

  const now = Date.now();
  if (Math.abs(now - timestamp) > AUTH_MAX_SKEW_MS) {
    return { ok: false, response: NextResponse.json({ error: "auth_expired" }, { status: 401 }) };
  }

  const address = normalizeSuiAddress(params.address || "");
  if (!address || !isValidSuiAddress(address)) {
    return { ok: false, response: NextResponse.json({ error: "invalid_address" }, { status: 400 }) };
  }

  if (headerAddress) {
    const normalizedHeader = normalizeSuiAddress(headerAddress);
    if (normalizedHeader !== address) {
      return { ok: false, response: NextResponse.json({ error: "address_mismatch" }, { status: 401 }) };
    }
  }

  const nonceKey = `${address}:${nonce}`;
  const nonceOk = await consumeNonce(nonceKey, AUTH_NONCE_TTL_MS);
  if (!nonceOk) {
    return { ok: false, response: NextResponse.json({ error: "replay_detected" }, { status: 401 }) };
  }

  if (params.body !== undefined) {
    if (!bodyHashHeader) {
      return { ok: false, response: NextResponse.json({ error: "body_hash_required" }, { status: 401 }) };
    }
    const expected = hashBody(params.body);
    if (expected !== bodyHashHeader) {
      return { ok: false, response: NextResponse.json({ error: "body_hash_mismatch" }, { status: 401 }) };
    }
  }

  const message = buildAuthMessage({
    intent: params.intent,
    address,
    timestamp,
    nonce,
    bodyHash: bodyHashHeader,
  });
  try {
    await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, { address });
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid_signature" }, { status: 401 }) };
  }

  return { ok: true };
}

export async function requireUserAuth(
  req: Request,
  params: { intent: string; address: string; body?: string; requireOrigin?: boolean }
): Promise<
  | { ok: true; address: string; authType: "session" | "signature" }
  | { ok: false; response: NextResponse }
> {
  const session = await getUserSessionFromCookies();
  if (session) {
    const normalized = normalizeSuiAddress(params.address || "");
    if (!normalized || !isValidSuiAddress(normalized)) {
      return { ok: false, response: NextResponse.json({ error: "invalid_address" }, { status: 400 }) };
    }
    if (normalized !== normalizeSuiAddress(session.address)) {
      await removeUserSessionByHash(session.tokenHash);
    } else {
      const requireOrigin =
        params.requireOrigin ?? !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
      if (requireOrigin && !ensureSameOrigin(req)) {
        return { ok: false, response: NextResponse.json({ error: "origin_mismatch" }, { status: 403 }) };
      }
      return { ok: true, address: session.address, authType: "session" };
    }
  }

  const auth = await requireUserSignature(req, params);
  if (!auth.ok) return auth;
  return { ok: true, address: normalizeSuiAddress(params.address), authType: "signature" };
}
