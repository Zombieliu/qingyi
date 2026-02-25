import { after, NextResponse } from "next/server";
import crypto from "crypto";
import {
  addOrder,
  getPlayerById,
  getPlayerByAddress,
  hasOrdersForAddress,
  queryOrders,
  queryPublicOrdersCursor,
} from "@/lib/admin/admin-store";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { rateLimit, consumeNonce } from "@/lib/rate-limit";
import { clearChainOrderCache } from "@/lib/chain/chain-sync";
import {
  getCacheAsync,
  setCache,
  computeJsonEtag,
  invalidateCacheByPrefix,
} from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";
import { getClientIp } from "@/lib/shared/api-utils";
import { formatFullDateTime } from "@/lib/shared/date-utils";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { env } from "@/lib/env";
import { trackOrderCreated, trackWebhookFailed } from "@/lib/business-events";
import { publishOrderEvent } from "@/lib/realtime";
import {
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiRateLimited,
  apiInternalError,
} from "@/lib/shared/api-response";
const PUBLIC_ORDER_CACHE_TTL_MS = 5000;
const PUBLIC_ORDER_CACHE_CONTROL = "private, max-age=5, stale-while-revalidate=10";

async function enforceRateLimit(req: Request, limit: number, windowMs: number) {
  const key = `orders:${req.method}:${getClientIp(req)}`;
  return rateLimit(key, limit, windowMs);
}

type WecomMention =
  | { type: "all"; tag: string }
  | { type: "user"; tag: string }
  | { type: "mobile"; mobile: string }
  | { type: "none" };

function isMobileNumber(value: string) {
  return /^1\d{10}$/.test(value);
}

async function resolveWecomMention(meta?: Record<string, unknown>) {
  const requestedPlayerId =
    typeof meta?.requestedPlayerId === "string" ? meta.requestedPlayerId.trim() : "";
  const requestedPlayerName =
    typeof meta?.requestedPlayerName === "string" ? meta.requestedPlayerName.trim() : "";
  if (!requestedPlayerId) {
    if (requestedPlayerName) {
      return {
        mention: { type: "all", tag: "<@all>" } as WecomMention,
        fallbackAll: true,
        fallbackReason: "missing_id" as const,
        playerName: requestedPlayerName,
      };
    }
    return { mention: { type: "all", tag: "<@all>" } as WecomMention };
  }
  const player = await getPlayerById(requestedPlayerId);
  if (!player) {
    return {
      mention: { type: "all", tag: "<@all>" } as WecomMention,
      fallbackAll: true,
      fallbackReason: "missing_id" as const,
      playerName: requestedPlayerName,
    };
  }
  const contact = (player?.contact || "").trim();
  if (!contact) {
    return {
      mention: { type: "all", tag: "<@all>" } as WecomMention,
      fallbackAll: true,
      fallbackReason: "missing_contact" as const,
      playerName: player?.name || requestedPlayerName,
    };
  }
  if (isMobileNumber(contact)) {
    return {
      mention: { type: "mobile", mobile: contact } as WecomMention,
      playerName: player?.name,
    };
  }
  return {
    mention: { type: "user", tag: `<@${contact}>` } as WecomMention,
    playerName: player?.name,
  };
}

const orderSchema = z.object({
  user: z.string().min(1),
  item: z.string().min(1),
  amount: z.number(),
  currency: z.string().default("CNY"),
  status: z.string().default("status.paid"),
  note: z.string().optional(),
  orderId: z.string().optional(),
  userAddress: z.string().optional(),
  companionAddress: z.string().optional(),
  chainDigest: z.string().optional(),
  chainStatus: z.number().optional(),
  serviceFee: z.number().optional(),
  deposit: z.number().optional(),
  paymentStatus: z.string().optional(),
  stage: z.enum(["待处理", "已确认", "进行中", "已完成", "已取消"]).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const isPublicPool = searchParams.get("public") === "1";
  if (
    isPublicPool &&
    !(await enforceRateLimit(req, env.PUBLIC_ORDER_RATE_LIMIT_MAX, env.ORDER_RATE_LIMIT_WINDOW_MS))
  ) {
    return apiRateLimited();
  }
  const userAddressRaw = searchParams.get("address") || searchParams.get("userAddress") || "";
  const userAddress = userAddressRaw ? normalizeSuiAddress(userAddressRaw) : "";
  if (userAddress && !isValidSuiAddress(userAddress)) {
    return apiBadRequest("invalid userAddress");
  }
  const user = (searchParams.get("user") || "").trim();
  const q = (searchParams.get("q") || "").trim();

  if (!isPublicPool) {
    if (userAddress) {
      const auth = await requireUserAuth(req, { intent: "orders:read", address: userAddress });
      if (!auth.ok) return auth.response;
    } else {
      const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false });
      if (!admin.ok) return admin.response;
    }
  }

  if (isPublicPool) {
    if (!userAddress) {
      return apiUnauthorized("address_required");
    }
    const auth = await requireUserAuth(req, { intent: "orders:public", address: userAddress });
    if (!auth.ok) return auth.response;
    const playerLookup = await getPlayerByAddress(userAddress);
    if (!playerLookup.player || playerLookup.conflict || playerLookup.player.status === "停用") {
      return apiForbidden("player_required");
    }
    const cursorRaw = searchParams.get("cursor") || "";
    let cursor: { createdAt: number; id: string } | undefined;
    if (cursorRaw) {
      try {
        const decoded = Buffer.from(cursorRaw, "base64url").toString("utf8");
        const parsed = JSON.parse(decoded) as { createdAt?: number; id?: string };
        if (typeof parsed.createdAt === "number" && typeof parsed.id === "string") {
          cursor = { createdAt: parsed.createdAt, id: parsed.id };
        } else {
          return apiBadRequest("invalid_cursor");
        }
      } catch {
        return apiBadRequest("invalid_cursor");
      }
    }

    const publicPageSize = Math.min(30, Math.max(5, Number(searchParams.get("pageSize") || "20")));
    const cacheKey = `api:orders:public:${publicPageSize}:${cursorRaw || "start"}`;
    const cached = await getCacheAsync<{
      items: Array<{
        id: string;
        user: string;
        userAddress?: string;
        item: string;
        amount: number;
        currency: string;
        paymentStatus?: string;
        stage: string;
        chainDigest?: string;
        chainStatus?: number;
        serviceFee?: number;
        deposit?: number;
        createdAt: number;
        updatedAt?: number;
      }>;
      nextCursor: string | null;
    }>(cacheKey);
    if (cached?.etag) {
      const ifNoneMatch = getIfNoneMatch(req);
      if (ifNoneMatch === cached.etag) {
        return notModified(cached.etag, PUBLIC_ORDER_CACHE_CONTROL);
      }
      return jsonWithEtag(cached.value, cached.etag, PUBLIC_ORDER_CACHE_CONTROL);
    }
    const result = await queryPublicOrdersCursor({
      pageSize: publicPageSize,
      excludeStages: ["已完成", "已取消"],
      cursor,
    });
    const nextCursor = result.nextCursor
      ? Buffer.from(
          JSON.stringify({ createdAt: result.nextCursor.createdAt, id: result.nextCursor.id }),
          "utf8"
        ).toString("base64url")
      : null;
    const payload = {
      items: result.items.map((item) => ({
        id: item.id,
        user: "匿名用户",
        userAddress: item.userAddress ?? undefined,
        item: item.item,
        amount: item.amount,
        currency: item.currency,
        paymentStatus: undefined,
        stage: item.stage,
        chainDigest: item.chainDigest ?? undefined,
        chainStatus: item.chainStatus ?? undefined,
        serviceFee: undefined,
        deposit: undefined,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      nextCursor,
    };
    const etag = computeJsonEtag(payload);
    setCache(cacheKey, payload, PUBLIC_ORDER_CACHE_TTL_MS, etag);
    return jsonWithEtag(payload, etag, PUBLIC_ORDER_CACHE_CONTROL);
  }

  const result = await queryOrders({
    page,
    pageSize,
    address: userAddress || undefined,
    q: user || q || undefined,
  });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!(await enforceRateLimit(req, env.ORDER_RATE_LIMIT_MAX, env.ORDER_RATE_LIMIT_WINDOW_MS))) {
    return apiRateLimited();
  }

  const parsed = await parseBodyRaw(req, orderSchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const { user, item, amount, currency, status, note } = payload;

  const orderId = payload.orderId || `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const createdAt = Date.now();
  let userAddress: string | undefined;
  if (payload.userAddress) {
    const normalized = normalizeSuiAddress(payload.userAddress);
    if (!isValidSuiAddress(normalized)) {
      return apiBadRequest("invalid userAddress");
    }
    userAddress = normalized;
  } else {
    return apiUnauthorized("userAddress required");
  }
  let companionAddress: string | undefined;
  if (payload.companionAddress) {
    const normalized = normalizeSuiAddress(payload.companionAddress);
    if (!isValidSuiAddress(normalized)) {
      return apiBadRequest("invalid companionAddress");
    }
    companionAddress = normalized;
  }
  const meta = payload.meta ? { ...payload.meta } : {};
  if (payload.status) meta.status = payload.status;
  if ((payload.meta as { time?: string } | undefined)?.time) {
    meta.time = (payload.meta as { time?: string }).time;
  } else {
    meta.time = new Date(createdAt).toISOString();
  }

  const auth = await requireUserAuth(req, {
    intent: "orders:create",
    address: userAddress,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  const discountMeta = (
    payload.meta as { firstOrderDiscount?: Record<string, unknown> } | undefined
  )?.firstOrderDiscount;
  if (discountMeta) {
    const discount = Number((discountMeta as { amount?: number }).amount);
    const minSpend = Number((discountMeta as { minSpend?: number }).minSpend);
    const originalTotal = Number((discountMeta as { originalTotal?: number }).originalTotal);
    if (
      !Number.isFinite(discount) ||
      !Number.isFinite(minSpend) ||
      !Number.isFinite(originalTotal)
    ) {
      return apiBadRequest("invalid_discount");
    }
    if (originalTotal < minSpend || discount <= 0) {
      return apiBadRequest("invalid_discount");
    }
    const expected = Number((originalTotal - discount).toFixed(2));
    if (Math.abs(expected - amount) > 0.01) {
      return apiBadRequest("discount_mismatch");
    }
    if (await hasOrdersForAddress(userAddress)) {
      return apiForbidden("first_order_only");
    }
    // Prevent concurrent first-order discount abuse
    const nonceKey = `first-order:${userAddress}`;
    if (!(await consumeNonce(nonceKey, 30_000))) {
      return apiForbidden("first_order_only");
    }
  }

  try {
    // 从 meta 中提取用户选择的陪练，映射到 assignedTo
    const requestedPlayerName =
      typeof meta?.requestedPlayerName === "string" ? meta.requestedPlayerName.trim() : "";

    await addOrder({
      id: orderId,
      user,
      userAddress,
      companionAddress,
      item,
      amount,
      currency,
      paymentStatus: payload.paymentStatus || status,
      stage: (payload.stage as "待处理" | "已确认" | "进行中" | "已完成" | "已取消") || "待处理",
      displayStatus: payload.paymentStatus || status || "待处理",
      note,
      assignedTo: requestedPlayerName || undefined,
      source: "app",
      chainDigest: payload.chainDigest,
      chainStatus: payload.chainStatus,
      serviceFee: payload.serviceFee,
      deposit: payload.deposit,
      meta,
      createdAt,
    });

    // 如果是链上订单，立即清除缓存，确保下次查询能获取最新数据
    if (payload.chainDigest || payload.chainStatus !== undefined) {
      clearChainOrderCache();
    }

    trackOrderCreated(orderId, payload.chainDigest ? "chain" : "app", amount);

    // Publish realtime event
    if (userAddress) {
      after(
        publishOrderEvent(userAddress, {
          type: "status_change",
          orderId,
          stage: "待处理",
          timestamp: Date.now(),
        })
      );
    }

    // 新订单可能影响公共订单池，清除缓存
    invalidateCacheByPrefix("public-orders:");
  } catch (error) {
    console.error("Failed to persist order:", error);
    return apiInternalError("persist_failed");
  }
  if (env.E2E_SKIP_WEBHOOK === "1") {
    return NextResponse.json({ orderId, sent: true, error: null });
  }

  // 异步发送企微 webhook，不阻塞用户响应
  const webhook = env.WECHAT_WEBHOOK_URL;
  if (webhook) {
    after(async () => {
      try {
        const requestedNameRaw =
          typeof meta?.requestedPlayerName === "string" ? meta.requestedPlayerName.trim() : "";
        const resolved = await resolveWecomMention(meta);
        const requestedName = resolved.playerName || requestedNameRaw || "";
        const text = buildText({
          user,
          item,
          amount,
          currency,
          status,
          orderId,
          note,
          requestedPlayer: requestedName,
          fallbackAll: resolved.fallbackAll,
          fallbackReason: resolved.fallbackReason,
        });
        // 企微群机器人只有 text 类型支持 @ 提及，markdown 不支持
        const body: Record<string, unknown> =
          resolved.mention.type === "mobile"
            ? {
                msgtype: "text",
                text: {
                  content: text,
                  mentioned_mobile_list: [resolved.mention.mobile],
                },
              }
            : resolved.mention.type === "user"
              ? {
                  msgtype: "text",
                  text: {
                    content: text,
                    mentioned_list: [resolved.mention.tag.replace(/<@|>/g, "")],
                  },
                }
              : resolved.mention.type === "all"
                ? {
                    msgtype: "text",
                    text: {
                      content: text,
                      mentioned_list: ["@all"],
                    },
                  }
                : { msgtype: "text", text: { content: text } };
        const res = await fetch(`${webhook}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          console.error(`WeCom webhook failed: ${res.status}`);
          trackWebhookFailed(orderId, `HTTP ${res.status}`);
        }
      } catch (e) {
        console.error("WeCom webhook error:", (e as Error).message);
        trackWebhookFailed(orderId, (e as Error).message);
      }
    });
  }

  return NextResponse.json({ orderId, sent: true, error: null });
}

function buildText({
  user,
  item,
  amount,
  currency,
  status,
  orderId,
  note,
  requestedPlayer,
  fallbackAll,
  fallbackReason,
}: {
  user: string;
  item: string;
  amount: number;
  currency: string;
  status: string;
  orderId: string;
  note?: string;
  requestedPlayer?: string;
  fallbackAll?: boolean;
  fallbackReason?: "missing_id" | "missing_contact";
}) {
  const priceLine = currency === "CNY" ? `¥${amount}` : `${amount} ${currency}`;
  const now = formatFullDateTime(Date.now());
  const fallbackNote = fallbackAll
    ? fallbackReason === "missing_id"
      ? "（无法定位陪练，已@全部）"
      : "（未配置企微ID，已@全部）"
    : "";
  const lines = [
    "新订单提醒",
    `用户：${user}`,
    `商品：${item}`,
    `金额：${priceLine}`,
    `状态：${status}`,
    requestedPlayer ? `指定陪练：${requestedPlayer}${fallbackNote}` : "",
    note ? `备注：${note}` : "",
    `时间：${now}`,
    `订单号：${orderId}`,
  ];
  return lines.filter(Boolean).join("\n");
}
