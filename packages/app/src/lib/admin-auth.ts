import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AdminRole } from "./admin-types";
import {
  createSession,
  getAccessTokenByHash,
  getSessionByHash,
  removeSessionByHash,
  touchAccessTokenByHash,
  updateSessionByHash,
} from "./admin-store";
import { rateLimit } from "./rate-limit";
import { isIpAllowed, normalizeClientIp } from "./admin-ip-utils";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const LEGACY_ADMIN_COOKIE = "admin_token";
const DEFAULT_SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS || "12");
const RATE_LIMIT_WINDOW_MS = Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || "60000");
const RATE_LIMIT_MAX = Number(process.env.ADMIN_RATE_LIMIT_MAX || "120");
const LOGIN_RATE_LIMIT_MAX = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || "10");
const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || "").trim();
const ADMIN_REQUIRE_SESSION = process.env.ADMIN_REQUIRE_SESSION === "1";

type AdminTokenEntry = {
  token: string;
  role: AdminRole;
  label?: string;
  source?: "env" | "db";
  tokenHash?: string;
  id?: string;
};

type RequireOptions = {
  role?: AdminRole;
  allowToken?: boolean;
  requireOrigin?: boolean;
};

type RequireResult =
  | {
      ok: true;
      role: AdminRole;
      sessionId?: string;
      tokenLabel?: string;
      authType: "session" | "token" | "legacy";
    }
  | { ok: false; response: NextResponse };


function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function roleRank(role: AdminRole): number {
  switch (role) {
    case "admin":
      return 4;
    case "finance":
      return 3;
    case "ops":
      return 2;
    default:
      return 1;
  }
}

function parseAdminTokens(): AdminTokenEntry[] {
  const entries: AdminTokenEntry[] = [];
  const json = process.env.ADMIN_TOKENS_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const token = (item as { token?: string }).token;
          const role = (item as { role?: AdminRole }).role;
          if (token && role) {
            entries.push({ token, role, label: (item as { label?: string }).label });
          }
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [roleKey, value] of Object.entries(parsed as Record<string, unknown>)) {
          const role = roleKey as AdminRole;
          if (typeof value === "string") {
            entries.push({ token: value, role, label: roleKey });
          } else if (Array.isArray(value)) {
            for (const token of value) {
              if (typeof token === "string") {
                entries.push({ token, role, label: roleKey });
              }
            }
          }
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  const raw = process.env.ADMIN_TOKENS;
  if (raw) {
    for (const segment of raw.split(/[;,]/)) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const [roleRaw, token] = trimmed.split(":").map((part) => part.trim());
      if (roleRaw && token) {
        entries.push({ token, role: roleRaw as AdminRole, label: roleRaw });
      }
    }
  }

  const adminToken = process.env.ADMIN_DASH_TOKEN;
  const ledgerToken = process.env.LEDGER_ADMIN_TOKEN;
  if (adminToken) {
    entries.push({ token: adminToken, role: "admin", label: "ADMIN_DASH_TOKEN" });
  }
  if (ledgerToken) {
    const role: AdminRole = adminToken ? "finance" : "admin";
    entries.push({ token: ledgerToken, role, label: "LEDGER_ADMIN_TOKEN" });
  }

  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.token)) return false;
    seen.add(entry.token);
    return true;
  });
}

async function getRoleForToken(token?: string | null): Promise<AdminTokenEntry | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const dbEntry = await getAccessTokenByHash(tokenHash);
  if (dbEntry && dbEntry.status === "active") {
    return {
      token,
      role: dbEntry.role,
      label: dbEntry.label || dbEntry.tokenPrefix,
      source: "db",
      tokenHash,
      id: dbEntry.id,
    };
  }
  const entries = parseAdminTokens();
  const envEntry = entries.find((entry) => entry.token === token);
  return envEntry ? { ...envEntry, source: "env" } : null;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const raw = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
  return normalizeClientIp(raw);
}

export function enforceAdminIpAllowlist(req: Request): NextResponse | null {
  if (!ADMIN_IP_ALLOWLIST) return null;
  const ip = getClientIp(req);
  if (isIpAllowed(ip, ADMIN_IP_ALLOWLIST)) return null;
  return NextResponse.json({ error: "ip_forbidden" }, { status: 403 });
}

function enforceRateLimit(req: Request, limit: number, windowMs: number) {
  const key = `admin:${req.method}:${getClientIp(req)}`;
  return rateLimit(key, limit, windowMs);
}

export function ensureSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function getAdminSessionTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_SESSION_COOKIE)?.value || "";
}

export async function createAdminSession(params: {
  role: AdminRole;
  label?: string;
  ip?: string;
  userAgent?: string;
}) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = Date.now();
  const session = {
    id: `sess_${now}_${crypto.randomInt(1000, 9999)}`,
    tokenHash,
    role: params.role,
    label: params.label,
    createdAt: now,
    expiresAt: now + DEFAULT_SESSION_TTL_HOURS * 60 * 60 * 1000,
    lastSeenAt: now,
    ip: params.ip,
    userAgent: params.userAgent,
  };
  await createSession(session);
  return { token, session };
}

export async function rotateAdminSession(token: string) {
  const tokenHash = hashToken(token);
  const existing = await getSessionByHash(tokenHash);
  if (!existing) return null;
  await removeSessionByHash(tokenHash);
  const { token: nextToken, session } = await createAdminSession({
    role: existing.role,
    label: existing.label,
    ip: existing.ip,
    userAgent: existing.userAgent,
  });
  return { token: nextToken, session };
}

export async function revokeAdminSession(token: string) {
  const tokenHash = hashToken(token);
  return removeSessionByHash(tokenHash);
}

export async function getAdminSession() {
  const sessionToken = await getAdminSessionTokenFromCookies();
  if (sessionToken) {
    const sessionHash = hashToken(sessionToken);
    const session = await getSessionByHash(sessionHash);
    if (session) {
      if (session.expiresAt > Date.now()) {
        return session;
      }
      await removeSessionByHash(sessionHash);
    }
  }
  const legacyCookieStore = await cookies();
  const legacyToken = legacyCookieStore.get(LEGACY_ADMIN_COOKIE)?.value;
  if (legacyToken) {
    const entry = await getRoleForToken(legacyToken);
    if (entry) {
      return {
        id: "legacy",
        tokenHash: hashToken(legacyToken),
        role: entry.role,
        label: entry.label,
        createdAt: Date.now(),
        expiresAt: Date.now() + DEFAULT_SESSION_TTL_HOURS * 60 * 60 * 1000,
      };
    }
  }
  return null;
}

export async function requireAdmin(req: Request, options: RequireOptions = {}): Promise<RequireResult> {
  const { role = "viewer", allowToken = true, requireOrigin = req.method !== "GET" } = options;

  if (!(await enforceRateLimit(req, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "rate_limited" }, { status: 429 }),
    };
  }

  if (requireOrigin && !ensureSameOrigin(req) && !req.headers.get("x-admin-token")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_origin" }, { status: 403 }),
    };
  }

  const ipCheck = enforceAdminIpAllowlist(req);
  if (ipCheck) {
    return { ok: false, response: ipCheck };
  }

  const sessionToken = await getAdminSessionTokenFromCookies();
  if (sessionToken) {
    const sessionHash = hashToken(sessionToken);
    const session = await getSessionByHash(sessionHash);
    if (session) {
      if (session.expiresAt <= Date.now()) {
        await removeSessionByHash(sessionHash);
      } else {
        await updateSessionByHash(sessionHash, { lastSeenAt: Date.now() });
        if (roleRank(session.role) >= roleRank(role)) {
          return { ok: true, role: session.role, sessionId: session.id, authType: "session" };
        }
        return {
          ok: false,
          response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
        };
      }
    }
  }

  const legacyCookieStore = await cookies();
  const legacyToken = legacyCookieStore.get(LEGACY_ADMIN_COOKIE)?.value;
  if (!ADMIN_REQUIRE_SESSION && legacyToken) {
    const entry = await getRoleForToken(legacyToken);
    if (entry && roleRank(entry.role) >= roleRank(role)) {
      if (entry.source === "db" && entry.tokenHash) {
        await touchAccessTokenByHash(entry.tokenHash);
      }
      return { ok: true, role: entry.role, tokenLabel: entry.label, authType: "legacy" };
    }
  }

  if (!ADMIN_REQUIRE_SESSION && allowToken) {
    const header = req.headers.get("authorization") || "";
    const alt = req.headers.get("x-admin-token") || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const token = bearer || alt;
    const entry = await getRoleForToken(token);
    if (entry && roleRank(entry.role) >= roleRank(role)) {
      if (entry.source === "db" && entry.tokenHash) {
        await touchAccessTokenByHash(entry.tokenHash);
      }
      return { ok: true, role: entry.role, tokenLabel: entry.label, authType: "token" };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  };
}

export async function enforceLoginRateLimit(req: Request) {
  return enforceRateLimit(req, LOGIN_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
}

export async function getAdminRoleForToken(token?: string | null) {
  return getRoleForToken(token);
}

export function getAdminTokensSummary() {
  return parseAdminTokens().map((entry) => ({ role: entry.role, label: entry.label || entry.role }));
}
