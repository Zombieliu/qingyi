import "server-only";
import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

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
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }

  const headerToken = req.headers.get("x-cron-secret") || "";
  if (headerToken && safeEqual(headerToken, secret)) return true;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") || "";
  return queryToken ? safeEqual(queryToken, secret) : false;
}
