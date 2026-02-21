"use client";

import { signAuthIntent } from "@/lib/chain/qy-chain";

const AUTH_RETRY_ERRORS = new Set([
  "auth_required",
  "auth_expired",
  "session_missing",
  "invalid_signature",
  "replay_detected",
]);

let sessionPromise: Promise<void> | null = null;

async function buildAuthHeaders(intent: string, body?: string, addressOverride?: string) {
  const auth = await signAuthIntent(intent, body);
  if (addressOverride && addressOverride !== auth.address) {
    throw new Error("auth address mismatch");
  }
  return {
    auth,
    headers: {
      "x-auth-address": auth.address,
      "x-auth-signature": auth.signature,
      "x-auth-timestamp": String(auth.timestamp),
      "x-auth-nonce": auth.nonce,
      "x-auth-body-sha256": auth.bodyHash,
    } as Record<string, string>,
  };
}

export async function ensureUserSession(address: string) {
  if (!address) {
    throw new Error("请先登录账号");
  }
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const body = JSON.stringify({ address });
    const { headers } = await buildAuthHeaders("user:session:create", body, address);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "session_create_failed");
    }
  })();
  try {
    await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}

export async function fetchWithUserAuth(url: string, init: RequestInit, address: string) {
  const res = await fetch(url, init);
  if (res.status !== 401) return res;
  let shouldRetry = true;
  try {
    const data = await res.clone().json();
    if (data?.error && !AUTH_RETRY_ERRORS.has(data.error)) {
      shouldRetry = false;
    }
  } catch {
    // ignore parse errors
  }
  if (!shouldRetry) return res;
  await ensureUserSession(address);
  return fetch(url, init);
}
