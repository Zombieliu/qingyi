import "server-only";
import { consumeNonce } from "./rate-limit";

export async function acquireCronLock(key: string, ttlMs: number) {
  if (!key) return false;
  const lockKey = `cron:${key}`;
  return consumeNonce(lockKey, ttlMs);
}
