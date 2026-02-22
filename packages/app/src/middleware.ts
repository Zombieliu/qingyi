import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight middleware for cross-cutting concerns:
 * 1. Security headers (including CSP)
 * 2. Admin IP allowlist (early reject)
 * 3. Global API rate limiting (IP-based, in-memory for Edge Runtime)
 */

const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || "").trim();

// --- IP-based rate limiting (Edge-compatible, no Redis) ---
// Two tiers: read (GET) and write (POST/PUT/PATCH/DELETE)
const API_READ_LIMIT = 120; // per minute
const API_WRITE_LIMIT = 30; // per minute
const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const readBuckets = new Map<string, Bucket>();
const writeBuckets = new Map<string, Bucket>();

function checkRateLimit(buckets: Map<string, Bucket>, key: string, limit: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  existing.count += 1;
  // Prune stale entries periodically (every ~100 checks)
  if (existing.count % 100 === 0) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
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

// CSP directives — permissive enough for Next.js + SUI + Sentry
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://placehold.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.sui.io https://*.sentry.io wss://*.sui.io https://*.upstash.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // Admin IP allowlist
  if (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) {
    if (ADMIN_IP_ALLOWLIST && !isIpAllowed(ip, ADMIN_IP_ALLOWLIST)) {
      return NextResponse.json({ error: "ip_forbidden" }, { status: 403 });
    }
  }

  // Global API rate limiting
  if (pathname.startsWith("/api/")) {
    // Skip webhook endpoints (called by payment providers, verified by signature)
    if (!pathname.includes("/webhook")) {
      const isWrite = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
      const buckets = isWrite ? writeBuckets : readBuckets;
      const limit = isWrite ? API_WRITE_LIMIT : API_READ_LIMIT;
      if (!checkRateLimit(buckets, ip, limit)) {
        return NextResponse.json(
          { error: "rate_limited", message: "请求过于频繁，请稍后再试" },
          { status: 429, headers: { "Retry-After": "60" } }
        );
      }

      // CSRF: block cross-origin writes (browsers always send Origin on cross-origin POST)
      // Skip: webhooks (signature-verified), cron (secret-verified), admin-token requests
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
  matcher: [
    // Match all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/).*)",
  ],
};
