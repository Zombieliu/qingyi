import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/**
 * 实时事件通道
 *
 * 基于 Redis key 的轻量级事件通知：
 * - 写端：订单状态变更时调用 publishOrderEvent，更新 Redis key
 * - 读端：SSE handler 轮询 Redis key，检测到变化就推送给客户端
 *
 * 为什么不用 Redis pub/sub：Upstash REST API 不支持 SUBSCRIBE
 * 为什么不用 WebSocket：Vercel serverless 不支持长连接
 */

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;

const CHANNEL_PREFIX = "rt:order:";
const NOTIF_PREFIX = "rt:notif:";
const CHANNEL_TTL = 300; // 5 minutes

export type OrderEvent = {
  type: "status_change" | "assigned" | "completed" | "cancelled" | "deposit_paid";
  orderId: string;
  status?: string;
  stage?: string;
  timestamp: number;
};

/**
 * 发布订单事件（写端调用）
 *
 * 将事件写入 Redis，SSE handler 会检测到并推送
 */
export async function publishOrderEvent(userAddress: string, event: OrderEvent) {
  if (!redis || !userAddress) return;
  const key = `${CHANNEL_PREFIX}${userAddress}`;
  try {
    await redis.set(key, JSON.stringify(event), { ex: CHANNEL_TTL });
  } catch {
    // Redis unavailable, silently fail
  }
}

/**
 * 读取最新事件（SSE handler 调用）
 *
 * 返回事件后不删除，由 TTL 自动过期
 * SSE handler 通过比较 timestamp 判断是否有新事件
 */
export async function getLatestEvent(userAddress: string): Promise<OrderEvent | null> {
  if (!redis || !userAddress) return null;
  try {
    const raw = await redis.get<string>(key(userAddress));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as OrderEvent);
  } catch {
    return null;
  }
}

function key(userAddress: string) {
  return `${CHANNEL_PREFIX}${userAddress}`;
}

// ─── Notification events ───

export type NotificationEvent = {
  type: "notification";
  id: string;
  title: string;
  body: string;
  notifType: string;
  orderId?: string;
  timestamp: number;
};

export async function publishNotificationEvent(userAddress: string, event: NotificationEvent) {
  if (!redis || !userAddress) return;
  const k = `${NOTIF_PREFIX}${userAddress}`;
  try {
    await redis.set(k, JSON.stringify(event), { ex: CHANNEL_TTL });
  } catch {
    // silently fail
  }
}

export async function getLatestNotificationEvent(
  userAddress: string
): Promise<NotificationEvent | null> {
  if (!redis || !userAddress) return null;
  try {
    const raw = await redis.get<string>(`${NOTIF_PREFIX}${userAddress}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as NotificationEvent);
  } catch {
    return null;
  }
}
