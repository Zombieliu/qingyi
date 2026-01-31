import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export function getAdminSecret() {
  return process.env.ADMIN_DASH_TOKEN || process.env.LEDGER_ADMIN_TOKEN || "";
}

export function isAdminTokenValid(token?: string | null) {
  const secret = getAdminSecret();
  if (!secret) return false;
  return token === secret;
}

export async function getAdminTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get("admin_token")?.value || "";
}

export async function requireAdmin() {
  const token = await getAdminTokenFromCookies();
  if (!isAdminTokenValid(token)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, token };
}
