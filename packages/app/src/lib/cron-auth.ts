import "server-only";
import { env } from "@/lib/env";

/**
 * Verify cron request authorization.
 *
 * In production, only accepts:
 * 1. Vercel's x-vercel-cron header (set automatically by Vercel Cron)
 * 2. CRON_SECRET via x-cron-secret header or ?token= query param
 *
 * In development, allows unauthenticated access if CRON_SECRET is not set.
 */
export function isAuthorizedCron(req: Request): boolean {
  // Vercel Cron sets this header automatically — most secure path
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (vercelCron) return true;

  const secret = env.CRON_SECRET;
  if (!secret) {
    // In production, require a secret
    if (process.env.NODE_ENV === "production") return false;
    // In dev, allow without secret for convenience
    return true;
  }

  // Check header first (preferred), then query param (legacy)
  const headerToken = req.headers.get("x-cron-secret") || "";
  if (headerToken && headerToken === secret) return true;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") || "";
  return queryToken === secret;
}
