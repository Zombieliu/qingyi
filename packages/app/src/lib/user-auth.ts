import "server-only";
import { NextResponse } from "next/server";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildAuthMessage } from "./auth-message";
import { consumeNonce } from "./rate-limit";
import crypto from "crypto";

const AUTH_MAX_SKEW_MS = Number(process.env.AUTH_MAX_SKEW_MS || "300000");
const AUTH_NONCE_TTL_MS = Number(process.env.AUTH_NONCE_TTL_MS || "600000");

function getHeaderValue(req: Request, key: string) {
  return req.headers.get(key) || "";
}

function hashBody(body: string) {
  return crypto.createHash("sha256").update(body).digest("base64");
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
