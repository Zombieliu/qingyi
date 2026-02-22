import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight middleware for cross-cutting concerns.
 * Heavy auth logic stays in route handlers — this only handles:
 * 1. Security headers (including CSP)
 * 2. Admin IP allowlist (early reject before hitting route handler)
 */

const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || "").trim();

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

  // Early IP check for admin routes
  if (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) {
    if (ADMIN_IP_ALLOWLIST) {
      const ip = getClientIp(req);
      if (!isIpAllowed(ip, ADMIN_IP_ALLOWLIST)) {
        return NextResponse.json({ error: "ip_forbidden" }, { status: 403 });
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
