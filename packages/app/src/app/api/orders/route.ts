import { NextResponse } from "next/server";
import crypto from "crypto";
import { addOrder, hasOrdersForAddress, queryOrders, queryPublicOrdersCursor } from "@/lib/admin-store";
import { requireAdmin } from "@/lib/admin-auth";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/user-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clearChainOrderCache } from "@/lib/chain-sync";

const ORDER_RATE_LIMIT_WINDOW_MS = Number(process.env.ORDER_RATE_LIMIT_WINDOW_MS || "60000");
const ORDER_RATE_LIMIT_MAX = Number(process.env.ORDER_RATE_LIMIT_MAX || "30");
const PUBLIC_ORDER_RATE_LIMIT_MAX = Number(process.env.PUBLIC_ORDER_RATE_LIMIT_MAX || "120");

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

async function enforceRateLimit(req: Request, limit: number, windowMs: number) {
  const key = `orders:${req.method}:${getClientIp(req)}`;
  return rateLimit(key, limit, windowMs);
}

interface OrderPayload {
  user: string;
  userAddress?: string;
  companionAddress?: string;
  item: string;
  amount: number; // 数量或价格数值
  currency?: string; // 可选，默认 CNY
  status?: "已支付" | "待支付" | string;
  stage?: string;
  paymentStatus?: string;
  note?: string;
  orderId?: string;
  chainDigest?: string;
  chainStatus?: number;
  serviceFee?: number;
  deposit?: number;
  meta?: Record<string, unknown>;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const isPublicPool = searchParams.get("public") === "1";
  if (isPublicPool && !(await enforceRateLimit(req, PUBLIC_ORDER_RATE_LIMIT_MAX, ORDER_RATE_LIMIT_WINDOW_MS))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const userAddressRaw = searchParams.get("address") || searchParams.get("userAddress") || "";
  const userAddress = userAddressRaw ? normalizeSuiAddress(userAddressRaw) : "";
  if (userAddress && !isValidSuiAddress(userAddress)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }
  const user = (searchParams.get("user") || "").trim();
  const q = (searchParams.get("q") || "").trim();

  if (!isPublicPool && !userAddress && !user && !q) {
    const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false });
    if (!admin.ok) return admin.response;
  }

  if (isPublicPool) {
    const cursorRaw = searchParams.get("cursor") || "";
    let cursor: { createdAt: number; id: string } | undefined;
    if (cursorRaw) {
      try {
        const decoded = Buffer.from(cursorRaw, "base64url").toString("utf8");
        const parsed = JSON.parse(decoded) as { createdAt?: number; id?: string };
        if (typeof parsed.createdAt === "number" && typeof parsed.id === "string") {
          cursor = { createdAt: parsed.createdAt, id: parsed.id };
        } else {
          return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
      }
    }

    const publicPageSize = Math.min(30, Math.max(5, Number(searchParams.get("pageSize") || "20")));
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
    return NextResponse.json({
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
    });
  }

  const result = await queryOrders({
    page,
    pageSize,
    address: userAddress || undefined,
    q: user || q || undefined,
  });
  if (userAddress) {
    const auth = await requireUserAuth(req, { intent: "orders:read", address: userAddress });
    if (!auth.ok) return auth.response;
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!(await enforceRateLimit(req, ORDER_RATE_LIMIT_MAX, ORDER_RATE_LIMIT_WINDOW_MS))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let rawBody = "";
  let payload: OrderPayload;
  try {
    rawBody = await req.text();
    payload = rawBody ? (JSON.parse(rawBody) as OrderPayload) : ({} as OrderPayload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { user, item, amount, currency = "CNY", status = "已支付", note } = payload;
  if (!user || !item || typeof amount !== "number") {
    return NextResponse.json({ error: "user, item, amount are required" }, { status: 400 });
  }

  const orderId = payload.orderId || `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const createdAt = Date.now();
  let userAddress: string | undefined;
  if (payload.userAddress) {
    const normalized = normalizeSuiAddress(payload.userAddress);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
    }
    userAddress = normalized;
  } else {
    return NextResponse.json({ error: "userAddress required" }, { status: 401 });
  }
  let companionAddress: string | undefined;
  if (payload.companionAddress) {
    const normalized = normalizeSuiAddress(payload.companionAddress);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid companionAddress" }, { status: 400 });
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

  const auth = await requireUserAuth(req, { intent: "orders:create", address: userAddress, body: rawBody });
  if (!auth.ok) return auth.response;

  const discountMeta = (payload.meta as { firstOrderDiscount?: Record<string, unknown> } | undefined)
    ?.firstOrderDiscount;
  if (discountMeta) {
    const discount = Number((discountMeta as { amount?: number }).amount);
    const minSpend = Number((discountMeta as { minSpend?: number }).minSpend);
    const originalTotal = Number((discountMeta as { originalTotal?: number }).originalTotal);
    if (!Number.isFinite(discount) || !Number.isFinite(minSpend) || !Number.isFinite(originalTotal)) {
      return NextResponse.json({ error: "invalid_discount" }, { status: 400 });
    }
    if (originalTotal < minSpend || discount <= 0) {
      return NextResponse.json({ error: "invalid_discount" }, { status: 400 });
    }
    const expected = Number((originalTotal - discount).toFixed(2));
    if (Math.abs(expected - amount) > 0.01) {
      return NextResponse.json({ error: "discount_mismatch" }, { status: 400 });
    }
    if (await hasOrdersForAddress(userAddress)) {
      return NextResponse.json({ error: "first_order_only" }, { status: 403 });
    }
  }

  try {
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
      note,
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
  } catch (error) {
    console.error("Failed to persist order:", error);
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }
  if (process.env.E2E_SKIP_WEBHOOK === "1") {
    return NextResponse.json({ orderId, sent: true, error: null });
  }

  const webhook = process.env.WECHAT_WEBHOOK_URL;
  let sent = false;
  let error: string | undefined;

  if (webhook) {
    const markdown = buildMarkdown({ user, item, amount, currency, status, orderId, note });
    try {
      const res = await fetch(`${webhook}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: { content: markdown },
        }),
      });
      sent = res.ok;
      if (!res.ok) {
        error = `WeCom webhook failed: ${res.status}`;
      }
    } catch (e) {
      error = (e as Error).message;
    }
  } else {
    error = "WECHAT_WEBHOOK_URL not set";
  }

  return NextResponse.json({ orderId, sent, error: error || null });
}

function buildMarkdown({
  user,
  item,
  amount,
  currency,
  status,
  orderId,
  note,
}: {
  user: string;
  item: string;
  amount: number;
  currency: string;
  status: string;
  orderId: string;
  note?: string;
}) {
  const priceLine = currency === "CNY" ? `¥${amount}` : `${amount} ${currency}`;
  const now = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(Date.now());

  const noteLine = note ? `> 备注：${note}\n` : "";

  return [
    `🛒 <font color="info">新订单</font>`,
    `> 用户：${user}`,
    `> 商品：${item}`,
    `> 金额：${priceLine}`,
    `> 状态：${status}`,
    noteLine,
    `> 时间：${now}`,
    `> 订单号：${orderId}`,
  ]
    .filter(Boolean)
    .join("\n");
}
