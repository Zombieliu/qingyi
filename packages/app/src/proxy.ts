import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";

/**
 * Middleware for cross-cutting concerns:
 * 1. Security headers (including CSP)
 * 2. Admin IP allowlist (early reject)
 * 3. Global API rate limiting (Redis-backed, with in-memory fallback)
 * 4. CSRF origin validation
 */

const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || "").trim();

// --- Redis-backed rate limiting (Edge-compatible) ---
const API_READ_LIMIT = 120; // per minute
const API_WRITE_LIMIT = 30; // per minute
const WINDOW_SECONDS = 60;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// In-memory fallback (for dev or when Redis is unavailable)
type Bucket = { count: number; resetAt: number };
const memBuckets = new Map<string, Bucket>();

async function checkRateLimit(key: string, limit: number): Promise<boolean> {
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }
      return count <= limit;
    } catch {
      // Redis failure — fall through to memory
    }
  }
  const now = Date.now();
  const windowMs = WINDOW_SECONDS * 1000;
  const existing = memBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count += 1;
  if (existing.count % 100 === 0) {
    for (const [k, v] of memBuckets) {
      if (v.resetAt <= now) memBuckets.delete(k);
    }
  }
  return existing.count <= limit;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
}

function isIpAllowed(ip: string, allowlist: string): boolean {
  if (!allowlist) return true;
  const allowed = allowlist.split(",").map((s) => s.trim().toLowerCase());
  const normalized = ip.toLowerCase().replace("::ffff:", "");
  return allowed.some((entry) => {
    const norm = entry.replace("::ffff:", "");
    return norm === normalized || norm === "0.0.0.0" || norm === "::";
  });
}

// --- CSRF origin validation ---
let allowedOrigins: Set<string> | null = null;

function getAllowedOrigins(): Set<string> {
  if (allowedOrigins) return allowedOrigins;
  allowedOrigins = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const vercelUrl = process.env.VERCEL_URL;
  if (appUrl)
    try {
      allowedOrigins.add(new URL(appUrl).origin);
    } catch {
      /* skip */
    }
  if (vercelUrl) allowedOrigins.add(`https://${vercelUrl}`);
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
  }
  return allowedOrigins;
}

function isAllowedOrigin(origin: string): boolean {
  return getAllowedOrigins().has(origin);
}

function safeOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.sentry.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://placehold.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.sui.io https://*.sentry.io wss://*.sui.io https://*.upstash.io",
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // Admin IP allowlist
  if (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) {
    if (ADMIN_IP_ALLOWLIST && !isIpAllowed(ip, ADMIN_IP_ALLOWLIST)) {
      return NextResponse.json({ error: "ip_forbidden" }, { status: 403 });
    }
  }

  // Global API rate limiting
  if (pathname.startsWith("/api/") && !pathname.includes("/webhook")) {
    const isWrite = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
    const prefix = isWrite ? "rl:w:" : "rl:r:";
    const limit = isWrite ? API_WRITE_LIMIT : API_READ_LIMIT;
    if (!(await checkRateLimit(`${prefix}${ip}`, limit))) {
      return NextResponse.json(
        { error: "rate_limited", message: "请求过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // CSRF: block cross-origin writes
    if (isWrite && !pathname.includes("/cron/")) {
      const hasAdminToken = req.headers.has("x-admin-token");
      const hasCronHeader = req.headers.has("x-vercel-cron") || req.headers.has("x-cron-secret");
      if (!hasAdminToken && !hasCronHeader) {
        const origin = req.headers.get("origin");
        const referer = req.headers.get("referer");
        if (origin || referer) {
          const requestOrigin = origin || safeOrigin(referer);
          if (requestOrigin && !isAllowedOrigin(requestOrigin)) {
            return NextResponse.json(
              { error: "forbidden", message: "Cross-origin request blocked" },
              { status: 403 }
            );
          }
        }
      }
    }
  }

  const res = NextResponse.next();

  // Security headers
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Content-Security-Policy", CSP_DIRECTIVES);

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/).*)"],
};
